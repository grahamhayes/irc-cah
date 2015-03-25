#0.8.0
* Added !discard command
* Added Not Safe For Humanity expansion
* Players are now referenced by nick instead of by user
* Players can now use the p, pick, and play aliases in private message windows
* Added work around for issue where cards can get clipped if they go over the split message limit
* Fixed an issue where negative time until the start of the game can be displayed when !status is used
* Reorganised config file into logical blocks
* Removed ability to run games in multiple channels
* Various typo and duplicate fixes

#0.7.0
* Added various extra card packs
* Bot now waits for a minute before starting a round
* Rounds now last 6 minutes
* Added !p and !j aliases
* Commands are now case insensitive
* If a player gets kicked from the channel the bot will remove the player from the game
* Bot will now set the topic of the channel when it joins the channel
* Bot now uses gender netural pronouns
* Bot will no longer pluralise 1 awesome point
* Fixed a memory leak in the nick/quit/part listener logic
* Fixed a logic problem with the part/quit handler logic

#0.6.0
* Added !pick command
* Added point limit option to games
* Default NODE_ENV changed to `production`

#pre-0.6.0
* Change log started in 0.6.0 :)
