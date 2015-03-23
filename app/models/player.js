var _ = require('underscore'),
    Cards = require('../controllers/cards');

var Player = function Player(nick, user, hostname) {
    var self = this;
    self.id = _.uniqueId('card');
    self.nick = nick;
    self.user = user;
    self.hostname = hostname;
    self.cards = new Cards();
    self.hasPlayed = false;
    self.hasDiscarded = false;
    self.isCzar = false;
    self.points = 0;
    self.idled = true;
};

/**
 * Expose `Player()`
 */
exports = module.exports = Player;
