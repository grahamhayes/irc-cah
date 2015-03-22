var _ = require('underscore'),
    Game = require('./game'),
    Player = require('../models/player'),
    config = require('../../config/config');

var Games = function Games() {
    var self = this;
    self.game;

    /**
     * Start a game
     * @param client
     * @param message
     * @param cmdArgs
     */
    self.start = function (client, message, cmdArgs) {
        // check if game running on the channel
        var channel = message.args[0],
            nick = message.nick,
            user = message.user,
            hostname = message.host;

        if (typeof self.game !== 'undefined') {
            // game exists
            client.say(channel, 'A game is already running. Type !join to join the game.');
        } else {
            // init game
            var new_game = new Game(channel, client, config, cmdArgs);
            self.game = new_game;
            var player = new Player(nick, user, hostname);
            self.game.addPlayer(player);
        }
    };

    /**
     * Stop a game
     * @param client
     * @param message
     * @param cmdArgs
     */
    self.stop = function (client, message, cmdArgs) {
        var channel = message.args[0],
            nick = message.nick,
            hostname = message.host;

        if (typeof self.game === 'undefined') {
            client.say(channel, 'No game running. Start the game by typing !start.');
        } else {
            var player = self.game.getPlayer({nick: nick, hostname: hostname});
            if (typeof(player) !== 'undefined') {
                self.game.stop(self.game.getPlayer({nick: nick, hostname: hostname}));
                self.game = undefined;
            }
        }
    };

    /**
     * Pause a game
     * @param client
     * @param message
     * @param cmdArgs
     */
     self.pause = function(client, message, cmdArgs) {
         var channel = message.args[0],
            nick = message.nick,
            hostname = message.host;

        if (typeof self.game === 'undefined') {
            client.say(channel, 'No game running. Start the game by typing !start.');
        } else {
            var player = self.game.getPlayer({nick: nick, hostname: hostname});
            if (typeof(player) !== 'undefined') {
                self.game.pause();
            }
        }
     };

    /**
     * Resume a game
     * @param client
     * @param message
     * @param cmdArgs
     */
     self.resume = function(client, message, cmdArgs) {
         var channel = message.args[0],
            nick = message.nick,
            hostname = message.host;

        if (typeof self.game === 'undefined') {
            client.say(channel, 'No game running. Start the game by typing !start.');
        } else {
            var player = self.game.getPlayer({nick: nick, hostname: hostname});
            if (typeof(player) !== 'undefined') {
                self.game.resume();
            }
        }
     };

    /**
     * Add player to game
     * @param client
     * @param message
     * @param cmdArgs
     */
    self.join = function (client, message, cmdArgs) {
        var channel = message.args[0],
            nick = message.nick,
            user = message.user,
            hostname = message.host;

        if (typeof self.game === 'undefined') {
            client.say(channel, 'No game running. Start the game by typing !start.');
        } else {
            var player = new Player(nick, user, hostname);
            self.game.addPlayer(player);
        }
    };

    /**
     * Remove player from game
     * @param client
     * @param message
     * @param cmdArgs
     */
    self.quit = function (client, message, cmdArgs) {
        var channel = message.args[0],
            nick = message.nick,
            hostname = message.host;

        if (typeof self.game === 'undefined') {
            client.say(channel, 'No game running. Start the game by typing !start.');
        } else {
            self.game.removePlayer(self.game.getPlayer({nick: nick, hostname: hostname}));
        }
    };

    /**
     * Get players cards
     * @param client
     * @param message
     * @param cmdArgs
     */
    self.cards = function (client, message, cmdArgs) {
        var channel = message.args[0],
            nick = message.nick,
            hostname = message.host;

        if (typeof seelf.game === 'undefined') {
            client.say(channel, 'No game running. Start the game by typing !start.');
        } else {
            var player = self.game.getPlayer({nick: nick, hostname: hostname});
            game.showCards(player);
        }
    };

    /**
     * Play cards
     * @param client
     * @param message
     * @param cmdArgs
     */
    self.play = function (client, message, cmdArgs) {
        // check if everyone has played and end the round
        var channel = message.args[0],
            user = message.user,
            hostname = message.host;

        if (typeof self.game === 'undefined') {
            client.say(channel, 'No game running. Start the game by typing !start.');
        } else {
            var player = self.game.getPlayer({nick: nick, hostname: hostname});
            if (typeof(player) !== 'undefined') {
                self.game.playCard(cmdArgs, player);
            }
        }
    };

    /**
     * Lisst players in the game
     * @param client
     * @param message
     * @param cmdArgs
     */
    self.list = function (client, message, cmdArgs) {
        var channel = message.args[0];

        if (typeof self.game === 'undefined') {
            client.say(channel, 'No game running. Start the game by typing !start.');
        } else {
            self.game.listPlayers();
        }
    };

    /**
     * Select the winner
     * @param client
     * @param message
     * @param cmdArgs
     */
    self.winner = function (client, message, cmdArgs) {
        var channel = message.args[0],
            nick = message.nick,
            hostname = message.host;

        if (typeof self.game === 'undefined') {
            client.say(channel, 'No game running. Start the game by typing !start.');
        } else {
            var player = self.game.getPlayer({nick: nick, hostname: hostname});
            if (typeof(player) !== 'undefined') {
                self.game.selectWinner(cmdArgs[0], player);
            }
        }
    };

    /**
     * Show top players in current game
     * @param client
     * @param message
     * @param cmdArgs
     */
    self.points = function (client, message, cmdArgs) {
        var channel = message.args[0],
            hostname = message.host;

        if (typeof self.game === 'undefined') {
            client.say(channel, 'No game running. Start the game by typing !start.');
        } else {
            self.game.showPoints();
        }
    };

    /**
     * Show top players in current game
     * @param client
     * @param message
     * @param cmdArgs
     */
    self.status = function(client, message, cmdArgs) {
        var channel = message.args[0];

        if (typeof self.game === 'undefined') {
            client.say(channel, 'No game running. Start the game by typing !start.');
        } else {
            self.game.showStatus();
        }
    };

    self.pick = function (client, message, cmdArgs) {
        // check if everyone has played and end the round
        var channel = message.args[0],
            nick = message.nick,
            hostname = message.host;

        if (typeof self.game === 'undefined'){
            client.say(channel, 'No game running. Start the game by typing !start.');
        } else {
            var player = self.game.getPlayer({nick: nick, hostname: hostname});

            if (typeof(player) !== 'undefined') {
                if (self.game.state === Game.STATES.PLAYED && channel === self.game.channel) {
                    self.game.selectWinner(cmdArgs[0], player);
                } else if (self.game.state === Game.STATES.PLAYABLE) {
                    self.game.playCard(cmdArgs, player);
                } else {
                    client.say(channel, '!pick command not available in current state.');
                }
            }
        }
    };

    self.discard = function (client, message, cmdArgs) {
        var channel = message.args[0],
            nick = message.nick,
            hostname = message.host;

        if (typeof self.game === 'undefined') {
            client.say(channel, 'No game running. Start the game by typing !start');
        } else {
            var player = self.game.getPlayer({nick: nick, hostname: hostname});

            if (self.game.state === Game.STATES.PLAYABLE) {
                self.game.discard(cmdArgs, player);
            } else {
                client.say(channel, '!discard command not available in current state');
            }
        }
    };
};

exports = module.exports = Games;
