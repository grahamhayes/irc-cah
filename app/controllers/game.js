var util = require('util'),
    c = require('irc-colors'),
    _ = require('underscore'),
    inflection = require('inflection'),
    Cards = require('../controllers/cards'),
    Card = require('../models/card');

/**
 * Available states for game
 * @type {{STOPPED: string, STARTED: string, PLAYABLE: string, PLAYED: string, ROUND_END: string, WAITING: string}}
 */
var STATES = {
    STOPPED:   'Stopped',
    STARTED:   'Started',
    PLAYABLE:  'Playable',
    PLAYED:    'Played',
    ROUND_END: 'RoundEnd',
    WAITING:   'Waiting',
    PAUSED:    'Paused'
};

// TODO: Implement the ceremonial haiku round that ends the game
var HAIKU = new Card({
    "draw": 2,
    "pick": 3,
    "value": "(Draw 2, Pick 3) Make a haiku."
});

/**
 * A single game object that handles all operations in a game
 * @param channel The channel the game is running on
 * @param client The IRC client object
 * @param config Configuration variables
 * @param cmdArgs !start command arguments
 * @constructor
 */
var Game = function Game(channel, client, config, cmdArgs) {
    var self = this;

    // properties
    self.waitCount = 0; // number of times waited until enough players
    self.round = 0; // round number
    self.players = []; // list of players
    self.channel = channel; // the channel this game is running on
    self.client = client; // reference to the irc client
    self.config = config; // configuration data
    self.state = STATES.STARTED; // game state storage
    self.pauseState = []; // pause state storage
    self.points = [];
    self.idleCounts = {};
    self.notifyUsersPending = false;
    self.pointLimit = 0; // point limit for the game, defaults to 0 (== no limit)

    console.log('Loaded', config.cards.length, 'cards:');
    var questions = _.filter(config.cards, function(card) {
        return card.type.toLowerCase() === 'question';
    });
    console.log(questions.length, 'questions');
    var answers = _.filter(config.cards, function(card) {
        return card.type.toLowerCase() === 'answer';
    });
    console.log(answers.length, 'answers');

    // init decks
    self.decks = {
        question: new Cards(questions),
        answer: new Cards(answers)
    };
    // init discard piles
    self.discards = {
        question: new Cards(),
        answer: new Cards()
    };
    // init table slots
    self.table = {
        question: null,
        answer: []
    };
    // shuffle decks
    self.decks.question.shuffle();
    self.decks.answer.shuffle();

    // parse point limit from configuration file
    if(typeof config.gameOptions.pointLimit !== 'undefined' && !isNaN(config.gameOptions.pointLimit)) {
        console.log('Set game point limit to ' + config.gameOptions.pointLimit + ' from config');
        self.pointLimit = parseInt(config.gameOptions.pointLimit);
    }
    // parse point limit from command arguments
    if(typeof cmdArgs[0] !==  'undefined' && !isNaN(cmdArgs[0])) {
        console.log('Set game point limit to ' + cmdArgs[0] + ' from arguments');
        self.pointLimit = parseInt(cmdArgs[0]);
    }

    /**
     * Stop game
     */
    self.stop = function (player, pointLimitReached) {
        self.state = STATES.STOPPED;

        if (typeof player !== 'undefined' && player !== null) {
            self.say(player.nick + ' stopped the game.');
        } else if (pointLimitReached !== true) {
            self.say('Game has been stopped.');
        }
        if(self.round > 1) {
            // show points if played more than one round
            self.showPoints();
        }

        // clear all timers
        clearTimeout(self.startTimeout);
        clearTimeout(self.stopTimeout);
        clearTimeout(self.turnTimer);
        clearTimeout(self.winnerTimer);

        // Remove listeners
        client.removeListener('part', self.playerPartHandler);
        client.removeListener('quit', self.playerQuitHandler);
        client.removeListener('kick' + self.channel, self.playerKickHandler);
        client.removeListener('nick', self.playerNickChangeHandler);
        client.removeListener('names'+ self.channel, self.notifyUsersHandler);

        // Destroy game properties
        delete self.players;
        delete self.config;
        delete self.client;
        delete self.channel;
        delete self.round;
        delete self.decks;
        delete self.discards;
        delete self.table;

        // set topic
        self.setTopic(c.bold.yellow('No game is running. Type !start to begin one!'));
    };

    /**
     * Pause game
     */
    self.pause = function () {
        // check if game is already paused
        if (self.state === STATES.PAUSED) {
            self.say('Game is already paused. Type !resume to begin playing again.');
            return false;
        }

        // only allow pause if game is in PLAYABLE or PLAYED state
        if (self.state !== STATES.PLAYABLE && self.state !== STATES.PLAYED) {
            self.say('The game cannot be paused right now.');
            return false;
        }

        // store state and pause game
        var now = new Date();
        self.pauseState.state = self.state;
        self.pauseState.elapsed = now.getTime() - self.roundStarted.getTime();
        self.state = STATES.PAUSED;

        self.say('Game is now paused. Type !resume to begin playing again.');

        // clear turn timers
        clearTimeout(self.turnTimer);
        clearTimeout(self.winnerTimer);
    };

    /**
     * Resume game
     */
    self.resume = function () {
        // make sure game is paused
        if (self.state !== STATES.PAUSED) {
            self.say('The game is not paused.');
            return false;
        }

        // resume game
        var now = new Date();
        var newTime = new Date();
        newTime.setTime(now.getTime() - self.pauseState.elapsed);
        self.roundStarted = newTime;
        self.state = self.pauseState.state;

        self.say('Game has been resumed.');

        // resume timers
        if (self.state === STATES.PLAYED) {
            // check if czar quit during pause
            if(self.players.indexOf(self.czar) < 0) {
                // no czar
                self.say('The czar quit the game during pause. I will pick the winner on this round.');
                // select winner
                self.selectWinner(Math.round(Math.random() * (self.table.answer.length - 1)));
            } else {
                self.winnerTimer = setInterval(self.winnerTimerCheck, 10 * 1000);
            }
        } else if (self.state === STATES.PLAYABLE) {
            self.turnTimer = setInterval(self.turnTimerCheck, 10 * 1000);
        }
    };

    /**
     * Start next round
     */
    self.nextRound = function () {
        clearTimeout(self.stopTimeout);
        // check if any player reached the point limit
        if(self.pointLimit > 0) {
            var winner = _.findWhere(self.players, {points: self.pointLimit});
            if(winner) {
                self.say(winner.nick + ' has the limit of ' + self.pointLimit + ' awesome ' +
                    inflection.inflect('points', self.pointLimit) + 'and is the winner of the game! Congratulations!');
                self.stop(null, true);
                return false;
            }
        }

        // check that there's enough players in the game
        if (self.players.length < 3) {
            self.say('Not enough players to start a round (need at least 3). Waiting for others to join. Stopping in ' +
                config.gameOptions.roundMinutes + ' ' + inflection.inflect('minutes', config.gameOptions.roundMinutes) + ' if not enough players.');
            self.state = STATES.WAITING;
            // stop game if not enough pleyers in however many minutes in the config
            self.stopTimeout = setTimeout(self.stop, 60 * 1000 * config.gameOptions.roundMinutes);
            return false;
        }
        self.round++;
        console.log('Starting round ', self.round);
        self.setCzar();
        self.deal();
        self.say('Round ' + self.round + '! ' + self.czar.nick + ' is the card czar.');
        self.playQuestion();
        // show cards for all players (except czar)
        _.each(self.players, function (player) {
            if (player.isCzar !== true) {
                self.showCards(player);
            }
        });
        self.state = STATES.PLAYABLE;
    };

    /**
     * Set a new czar
     * @returns Player The player object who is the new czar
     */
    self.setCzar = function () {
        if (self.czar) {
            console.log('Old czar:', self.czar.nick);
        }
        self.czar = self.players[self.players.indexOf(self.czar) + 1] || self.players[0];
        console.log('New czar:', self.czar.nick);
        self.czar.isCzar = true;
        return self.czar;
    };

    /**
     * Deal cards to fill players' hands
     */
    self.deal = function (player, num) {
        if (typeof player === 'undefined') {
            _.each(self.players, function (player, num) {
                console.log(player.nick + '(' + player.hostname + ') has ' + player.cards.numCards() + ' cards. Dealing ' + (10 - player.cards.numCards()) + ' cards');
                for (var i = player.cards.numCards(); i < 10; i++) {
                    self.checkDecks();
                    var card = self.decks.answer.pickCards();
                    player.cards.addCard(card);
                    card.owner = player;
                }
            }, this);
        } else {
            if (typeof num !== 'undefined') {
                for (var i = player.cards.numCards(); i < num; i++) {
                    self.checkDecks();
                    var card = self.decks.answer.pickCards();
                    player.cards.addCard(card);
                    card.owner = player;
                }
            }
        }
    };

    /**
     * Clean up table after round is complete
     */
    self.clean = function () {
        // move cards from table to discard
        self.discards.question.addCard(self.table.question);
        self.table.question = null;
        // var count = self.table.answer.length;
        _.each(self.table.answer, function (cards) {
            _.each(cards.getCards(), function (card) {
                card.owner = null;
                self.discards.answer.addCard(card);
                cards.removeCard(card);
            }, this);
        }, this);
        self.table.answer = [];

        // reset players
        var removedNicks = [];
        _.each(self.players, function (player) {
            player.hasPlayed = false;
            player.hasDiscarded = false;
            player.isCzar = false;
            // check if idled and remove
            if (player.inactiveRounds >= 1) {
                self.removePlayer(player, {silent: true});
                removedNicks.push(player.nick);
                self.idleCounts[player.nick]++;
            }
        });

        if (removedNicks.length > 0) {
            self.say('Removed inactive ' + inflection.inflect('players', removedNicks.length) + ': ' + removedNicks.join(', '));
        }
        // reset state
        self.state = STATES.STARTED;
    };

    /**
     * Play new question card on the table
     */
    self.playQuestion = function () {
        self.checkDecks();
        var card = self.decks.question.pickCards();
        // replace all instance of %s with underscores for prettier output
        var value = card.value.replace(/\%s/g, '___');
        // check if special pick & draw rules
        if (card.pick > 1) {
            value += c.bold(' [PICK ' + card.pick + ']');
        }
        if (card.draw > 0) {
            value += c.bold(' [DRAW ' + card.draw + ']');
        }
        self.say(c.bold('CARD: ') + value);
        self.table.question = card;

        // PM Card to players
        _.each(_.where(self.players, {isCzar: false}), function(player) {
            self.pm(player.nick, c.bold('CARD: ') + value);
        });

        // draw cards
        if (self.table.question.draw > 0) {
            _.each(_.where(self.players, {isCzar: false}), function (player) {
                for (var i = 0; i < self.table.question.draw; i++) {
                    self.checkDecks();
                    var c = self.decks.answer.pickCards();
                    player.cards.addCard(c);
                    c.owner = player;
                }
            });
        }
        // start turn timer, check every 10 secs
        clearInterval(self.turnTimer);
        self.roundStarted = new Date();
        self.turnTimer = setInterval(self.turnTimerCheck, 10 * 1000);
    };

    /**
     * Play a answer card from players hand
     * @param cards card indexes in players hand
     * @param player Player who played the cards
     */
    self.playCard = function (cards, player) {
        // don't allow if game is paused
        if (self.state === STATES.PAUSED) {
            self.say('Game is currently paused.');
            return false;
        }

        console.log(player.nick + ' played cards', cards.join(', '));
        // make sure different cards are played
        cards = _.uniq(cards);
        if (self.state !== STATES.PLAYABLE || player.cards.numCards() === 0) {
            self.say(player.nick + ': Can\'t play at the moment.');
        } else if (typeof player !== 'undefined') {
            if (player.isCzar === true) {
                self.say(player.nick + ': You are the card czar. The czar does not play. The czar makes other people do their dirty work.');
            } else {
                if (player.hasPlayed === true) {
                    self.say(player.nick + ': You have already played on this round.');
                } else if (cards.length != self.table.question.pick) {
                    // invalid card count
                    self.say(player.nick + ': You must pick '
                        + inflection.inflect('cards', self.table.question.pick, '1 card', self.table.question.pick + ' different cards') + '.');
                } else {
                    // get played cards
                    var playerCards;
                    try {
                        playerCards = player.cards.pickCards(cards);
                    } catch (error) {
                        self.pm(player.nick, 'Invalid card index');
                        return false;
                    }
                    self.table.answer.push(playerCards);
                    player.hasPlayed = true;
                    player.inactiveRounds = 0;
                    self.pm(player.nick, 'You played: ' + self.getFullEntry(self.table.question, playerCards.getCards()));
                    // show entries if all players have played
                    if (self.checkAllPlayed()) {
                        self.showEntries();
                    }
                }
            }
        } else {
            console.warn('Invalid player tried to play a card');
        }
    };

    /**
     * Allow a player to discard a number of cards once per turn
     * @param cards Array of card indexes to discard
     * @param player The player who discarded
     */
    self.discard = function (cards, player) {
        if (self.state === STATES.PAUSED) {
            self.say('Game is currently paused');
            return false;
        }

        console.log(player.nick + ' discarded ' + cards.join(', '));
        cards = _.uniq(cards);

        if (self.state !== STATES.PLAYABLE || player.cards.numCards() === 0) {
            self.say(player.nick + ': Can\'t discard at the moment.');
        } else if (typeof player !== 'undefined') {
            if (player.isCzar === true) {
                self.say(player.nick + ': You are the card czar. You cannot discard cards until you are a regular player.');
            } else {
                if (player.hasDiscarded === true) {
                    self.say(player.nick + ': You may only discard once per turn.');
                } else if (player.points < 1) {
                    self.say(player.nick + ': You must have at least one awesome point to discard.');
                } else {
                    var playerCards;

                    if (cards.length === 0){
                        cards = [];
                        for (var i = 0; i < player.cards.numCards(); i++) {
                            cards[i] = i;
                        }
                    }

                    try {
                        playerCards = player.cards.pickCards(cards);
                    } catch (error) {
                        self.pm(player.nick, 'Invalid card index.');
                        return false;
                    }

                    self.deal(player, player.cards.numCards() + playerCards.numCards());

                    // Add the cards to the discard pile, and reduce points, and mark the player as having discarded
                    _.each(playerCards.getCards(), function (card) {
                        card.owner = null;
                        self.discards.answer.addCard(card);
                        playerCards.removeCard(card);
                    });

                    player.hasDiscarded = true;
                    player.points--;

                    self.pm(player.nick, 'You have discarded, and have ' + player.points + ' ' +
                        inflection.inflect('points', player.points) + ' remaining');
                    self.showCards(player);
                }
            }
        } else {
            console.warn('Invalid player tried to discard cards')
        }
    }

    /**
     * Check the time that has elapsed since the beinning of the turn.
     * End the turn is time limit is up
     */
    self.turnTimerCheck = function () {
        // check the time
        var now = new Date();
        var timeLimit = 60 * 1000 * config.gameOptions.roundMinutes;
        var roundElapsed = (now.getTime() - self.roundStarted.getTime());
        console.log('Round elapsed:', roundElapsed, now.getTime(), self.roundStarted.getTime());
        if (roundElapsed >= timeLimit) {
            console.log('The round timed out');
            self.say('Time is up!');
            self.markInactivePlayers();
            // show end of turn
            self.showEntries();
        } else if (roundElapsed >= timeLimit - (10 * 1000) && roundElapsed < timeLimit) {
            // 10s ... 0s left
            self.say('10 seconds left!');
        } else if (roundElapsed >= timeLimit - (30 * 1000) && roundElapsed < timeLimit - (20 * 1000)) {
            // 30s ... 20s left
            self.say('30 seconds left!');
        } else if (roundElapsed >= timeLimit - (60 * 1000) && roundElapsed < timeLimit - (50 * 1000)) {
            // 60s ... 50s left
            self.say('Hurry up, 1 minute left!');
            self.showStatus();
        }
    };

    /**
     * Show the entries
     */
    self.showEntries = function () {
        // clear round timer
        clearInterval(self.turnTimer);

        self.state = STATES.PLAYED;
        // Check if 2 or more entries...
        if (self.table.answer.length === 0) {
            self.say('No one played on this round.');
            // skip directly to next round
            self.clean();
            self.nextRound();
        } else if (self.table.answer.length === 1) {
            self.say('Only one player played and is the winner by default.');
            self.selectWinner(0);
        } else {
            self.say('Everyone has played. Here are the entries:');
            // shuffle the entries
            self.table.answer = _.shuffle(self.table.answer);
            _.each(self.table.answer, function (cards, i) {
                self.say(i + ": " + self.getFullEntry(self.table.question, cards.getCards()));
            }, this);
            // check that czar still exists
            var currentCzar = _.findWhere(this.players, {isCzar: true});
            if (typeof currentCzar === 'undefined') {
                // no czar, random winner (TODO: Voting?)
                self.say('The czar has fled the scene. So I will pick the winner on this round.');
                self.selectWinner(Math.round(Math.random() * (self.table.answer.length - 1)));
            } else {
                self.say(self.czar.nick + ': Select the winner (!winner <entry number>)');
                // start turn timer, check every 10 secs
                clearInterval(self.winnerTimer);
                self.roundStarted = new Date();
                self.winnerTimer = setInterval(self.winnerTimerCheck, 10 * 1000);
            }
        }
    };

    /**
     * Check the time that has elapsed since the beinning of the winner select.
     * End the turn is time limit is up
     */
    self.winnerTimerCheck = function () {
        // check the time
        var now = new Date();
        var timeLimit = 60 * 1000 * config.gameOptions.roundMinutes;
        var roundElapsed = (now.getTime() - self.roundStarted.getTime());
        console.log('Winner selection elapsed:', roundElapsed, now.getTime(), self.roundStarted.getTime());
        if (roundElapsed >= timeLimit) {
            console.log('the czar is inactive, selecting winner');
            self.say('Time is up. I will pick the winner on this round.');
            // Check czar & remove player after 3 timeouts
            self.czar.inactiveRounds++;
            // select winner
            self.selectWinner(Math.round(Math.random() * (self.table.answer.length - 1)));
        } else if (roundElapsed >= timeLimit - (10 * 1000) && roundElapsed < timeLimit) {
            // 10s ... 0s left
            self.say(self.czar.nick + ': 10 seconds left!');
        } else if (roundElapsed >= timeLimit - (30 * 1000) && roundElapsed < timeLimit - (20 * 1000)) {
            // 30s ... 20s left
            self.say(self.czar.nick + ': 30 seconds left!');
        } else if (roundElapsed >= timeLimit - (60 * 1000) && roundElapsed < timeLimit - (50 * 1000)) {
            // 60s ... 50s left
            self.say(self.czar.nick + ': Hurry up, 1 minute left!');
        }
    };

    /**
     * Pick an entry that wins the round
     * @param index Index of the winning card in table list
     * @param player Player who said the command (use null for internal calls, to ignore checking)
     */
    self.selectWinner = function (index, player) {
        // don't allow if game is paused
        if (self.state === STATES.PAUSED) {
            self.say('Game is currently paused.');
            return false;
        }

        // clear winner timer
        clearInterval(self.winnerTimer);

        var winner = self.table.answer[index];
        if (self.state === STATES.PLAYED) {
            if (typeof player !== 'undefined' && player !== self.czar) {
                client.say(player.nick + ': You are not the card czar. Only the card czar can select the winner');
            } else if (typeof winner === 'undefined') {
                self.say('Invalid winner');
            } else {
                self.state = STATES.ROUND_END;
                var owner = winner.cards[0].owner;
                owner.points++;
                // update points object
                _.findWhere(self.points, {player: owner}).points = owner.points;
                // announce winner
                self.say(c.bold('Winner is: ') + owner.nick + ' with "' + self.getFullEntry(self.table.question, winner.getCards()) +
                    '" and gets one awesome point! ' + owner.nick + ' has ' + owner.points + ' awesome ' + inflection.inflect('point', owner.points) + '.');

                self.clean();
                self.nextRound();
            }
        }
    };

    /**
     * Get formatted entry
     * @param question
     * @param answers
     * @returns {*|Object|ServerResponse}
     */
    self.getFullEntry = function (question, answers) {
        var args = [question.value];
        _.each(answers, function (card) {
            args.push(card.value);
        }, this);
        return util.format.apply(this, args);
    };

    /**
     * Check if all active players played on the current round
     * @returns Boolean true if all players have played
     */
    self.checkAllPlayed = function () {
        var allPlayed = false;
        if (self.getNotPlayed().length === 0) {
            allPlayed = true;
        }
        return allPlayed;
    };

    /**
     * Check if decks are empty & reset with discards
     */
    self.checkDecks = function () {
        // check answer deck
        if (self.decks.answer.numCards() === 0) {
            console.log('answer deck is empty. reset from discard.');
            self.decks.answer.reset(self.discards.answer.reset());
            self.decks.answer.shuffle();
        }
        // check question deck
        if (self.decks.question.numCards() === 0) {
            console.log('question deck is empty. reset from discard.');
            self.decks.question.reset(self.discards.question.reset());
            self.decks.question.shuffle();
        }
    };

    /**
     * Add a player to the game
     * @param player Player object containing new player's data
     * @returns The new player or false if invalid player
     */
    self.addPlayer = function (player) {
        if (typeof self.getPlayer({nick: player.nick, hostname: player.hostname}) === 'undefined') {
            // Returning players
            var pointsPlayer = _.findWhere(self.points, {nick: player.nick, hostname: player.hostname});
            if (typeof pointsPlayer === 'undefined') {
                self.points.push({
                    nick: player.nick,
                    hostname: player.hostname,
                    player: player,
                    points: 0
                });
                self.idleCounts[player.nick] = 0;
            } else {
                if (self.idleCounts[player.nick] >= config.gameOptions.idleLimit) {
                    self.say(player.nick + ': You have idled too much and have been banned from this game.');
                    return false;
                } else {
                    pointsPlayer.player = player;
                    player.points = pointsPlayer.points;
                }
            }

            self.players.push(player);
            self.say(player.nick + ' has joined the game');

            // check if waiting for players
            if (self.state === STATES.WAITING && self.players.length >= 3) {
                // enough players, start the game
                self.nextRound();
            }

            return player;
        }

        return false;
    };

    /**
     * Find player
     * @param search
     * @returns {*}
     */
    self.getPlayer = function (search) {
        return _.findWhere(self.players, search);
    };

    /**
     * Remove player from game
     * @param player
     * @param options Extra options
     * @returns The removed player or false if invalid player
     */
    self.removePlayer = function (player, options) {
        options = _.extend({}, options);
        if (typeof player !== 'undefined') {
            console.log('removing' + player.nick + ' from the game');
            // get cards in hand
            var cards = player.cards.reset();
            // remove player
            self.players = _.without(self.players, player);
            // put player's cards to discard
            _.each(cards, function (card) {
                console.log('Add card ', card.text, 'to discard');
                self.discards.answer.addCard(card);
            });
            if (options.silent !== true) {
                self.say(player.nick + ' has left the game');
            }

            // check if remaining players have all player
            if (self.state === STATES.PLAYABLE && self.checkAllPlayed()) {
                self.showEntries();
            }

            // check czar
            if (self.state === STATES.PLAYED && self.czar === player) {
                self.say('The czar has fled the scene. So I will pick the winner on this round.');
                self.selectWinner(Math.round(Math.random() * (self.table.answer.length - 1)));
            }

            return player;
        }
        return false;
    };

    /**
     * Get all player who have not played
     * @returns Array list of Players that have not played
     */
    self.getNotPlayed = function () {
        return _.where(_.filter(self.players, function (player) {
            // check only players with cards (so players who joined in the middle of a round are ignored)
            return player.cards.numCards() > 0;
        }), {hasPlayed: false, isCzar: false});
    };

    /**
     * Check for inactive players
     * @param options
     */
    self.markInactivePlayers = function (options) {
        _.each(self.getNotPlayed(), function (player) {
            player.inactiveRounds++;
        }, this);
    };

    /**
     * Show players cards to player
     * @param player
     */
    self.showCards = function (player) {
        if (typeof player !== 'undefined') {
            var cardsZeroToSix = 'Your cards are:';
            var cardsSevenToTwelve = '';
            _.each(player.cards.getCards(), function (card, index) {
                if (index < 7) {
                    cardsZeroToSix += c.bold(' [' + index + '] ') + card.value;
                } else {
                    cardsSevenToTwelve += c.bold('[' + index + '] ') + card.value + ' ';
                }
            }, this);

            self.pm(player.nick, cardsZeroToSix);
            self.pm(player.nick, cardsSevenToTwelve);
        }
    };

    /**
     * Show points for all players
     */
    self.showPoints = function () {
        var sortedPlayers = _.sortBy(self.points, function (point) {
            return -point.player.points;
        });
        var output = '';
        _.each(sortedPlayers, function (point) {
            output += point.player.nick + ' ' + point.player.points + ' awesome ' + inflection.inflect('point', point.player.points) + ', ';
        });
        self.say('The most horrible people: ' + output.slice(0, -2));
    };

    /**
     * Show status
     */
    self.showStatus = function () {
        var playersNeeded = Math.max(0, 3 - self.players.length), // amount of player needed to start the game
            timeLeft = config.gameOptions.secondsBeforeStart - Math.round((new Date().getTime() - self.startTime.getTime()) / 1000),
            activePlayers = _.filter(self.players, function (player) {
                // only players with cards in hand are active
                return player.cards.numCards() > 0;
            }),
            played = _.where(activePlayers, {isCzar: false, hasPlayed: true}), // players who have already played
            notPlayed = _.where(activePlayers, {isCzar: false, hasPlayed: false}); // players who have not played yet
        switch (self.state) {
            case STATES.PLAYABLE:
                self.say(c.bold('Status: ') + self.czar.nick + ' is the czar. Waiting for ' +
                    inflection.inflect('players', _.pluck(notPlayed, 'nick').length) + ' to play: ' + _.pluck(notPlayed, 'nick').join(', '));
                break;
            case STATES.PLAYED:
                self.say(c.bold('Status: ') + 'Waiting for ' + self.czar.nick + ' to select the winner.');
                break;
            case STATES.ROUND_END:
                self.say(c.bold('Status: ') + 'Round has ended and next one is starting.');
                break;
            case STATES.STARTED:
                self.say(c.bold('Status: ') + 'Game starts in ' + timeLeft + ' ' + inflection.inflect('seconds', timeLeft) + '. Need ' +
                    playersNeeded + ' more ' + inflection.inflect('players', playersNeeded) + ' to start.');
                break;
            case STATES.STOPPED:
                self.say(c.bold('Status: ') + 'Game has been stopped.');
                break;
            case STATES.WAITING:
                self.say(c.bold('Status: ') + 'Not enough players to start. Need ' + playersNeeded + ' more ' +
                    inflection.inflect('players', playersNeeded) + ' to start.');
                break;
            case STATES.PAUSED:
                self.say(c.bold('Status: ') + 'Game is paused.');
                break;
        }
    };

    /**
     * Set the channel topic
     */
    self.setTopic = function (topic) {
        // ignore if not configured to set topic
        if (typeof config.gameOptions.setTopic === 'undefined' || !config.gameOptions.setTopic) {
            return false;
        }

        // construct new topic
        var newTopic = topic;
        if (typeof config.gameOptions.topicBase !== 'undefined') {
            newTopic = topic + ' ' + config.gameOptions.topicBase;
        }

        // set it
        client.send('TOPIC', channel, newTopic);
    };

    /**
     * List all players in the current game
     */
    self.listPlayers = function () {
        self.say('Players currently in the game: ' + _.pluck(self.players, 'nick').join(', '));
    };

    /**
     * Helper function for the handlers below
     */
    self.findAndRemoveIfPlaying = function (nick) {
        var player = self.getPlayer({nick: nick});

        if (typeof player !== 'undefined') {
            self.removePlayer(player);
        }
    };

    /**
     * Handle player parts
     * @param channel
     * @param nick
     * @param reason
     * @param message
     */
    self.playerPartHandler = function (channel, nick, reason, message) {
        console.log('Player ' + nick + ' left');
        self.findAndRemoveIfPlaying(nick);
    };

    /**
     * Handle player kicks
     * @param nick
     * @param by
     * @param reason
     * @param message
     */
    self.playerKickHandler = function (nick, by, reason, message) {
        console.log('Player ' + nick + ' was kicked by ' + by);
        self.findAndRemoveIfPlaying(nick);
    };

    /**
     * Handle player kicks
     * @param nick
     * @param reason
     * @param channel
     * @param message
     */
    self.playerQuitHandler = function (nick, reason, channel, message) {
        console.log('Player ' + nick + ' left');
        self.findAndRemoveIfPlaying(nick);
    };

    /**
     * Handle player nick changes
     * @param oldnick
     * @param newnick
     * @param channels
     * @param message
     */
    self.playerNickChangeHandler = function (oldnick, newnick, channels, message) {
        console.log('Player changed nick from ' + oldnick + ' to ' + newnick);
        var player = self.getPlayer({nick: oldnick});
        if (typeof player !== 'undefined') {
            player.nick = newnick;
        }
    };

    /**
     * Notify users in channel that game has started
     */
    self.notifyUsers = function() {
        // request names
        client.send('NAMES', channel);

        // signal handler to send notifications
        self.notifyUsersPending = true;
    };

    /**
     * Handle names response to notify users
     * @param nicks
     */
    self.notifyUsersHandler = function(nicks) {
        // ignore if we haven't requested this
        if (self.notifyUsersPending === false) {
            return false;
        }

        // don't message nicks with these modes
        var exemptModes = ['~', '&'];

        // loop through and send messages
        _.each(nicks, function(mode, nick) {
            if (_.indexOf(exemptModes, mode) < 0 && nick !== config.botOptions.nick) {
                self.notice(nick, nick + ': A new game of Cards Against Humanity just began in ' + channel + '. Head over and !join if you\'d like to get in on the fun!');
            }
        });

        // reset
        self.notifyUsersPending = false;
    };

    /**
     * Public message to the game channel
     * @param string
     */
    self.say = function (string) {
        self.client.say(self.channel, string);
    };

    self.pm = function (nick, string) {
        self.client.say(nick, string);
    };

    self.notice = function (nick, string) {
        self.client.notice(nick, string);
    };

    // set topic
    self.setTopic(c.bold.lime('A game is running. Type !join to get in on it!'));

    // announce the game on the channel
    self.say('A new game of ' + c.rainbow('Cards Against Humanity') + '. The game starts in ' + config.gameOptions.secondsBeforeStart
        + ' ' + inflection.inflect('seconds', config.gameOptions.secondsBeforeStart) + '. Type !join to join the game any time.');

    // notify users
    if (typeof config.gameOptions.notifyUsers !== 'undefined' && config.gameOptions.notifyUsers) {
        self.notifyUsers();
    }

    // wait for players to join
    self.startTime = new Date();
    self.startTimeout = setTimeout(self.nextRound, config.gameOptions.secondsBeforeStart * 1000);

    // client listeners
    client.addListener('part', self.playerPartHandler);
    client.addListener('quit', self.playerQuitHandler);
    client.addListener('kick'+channel, self.playerKickHandler);
    client.addListener('nick', self.playerNickChangeHandler);
    client.addListener('names'+channel, self.notifyUsersHandler);
};

// export static state constant
Game.STATES = STATES;

exports = module.exports = Game;
