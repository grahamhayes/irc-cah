var fs = require('fs'),
    JaySchema = require('jayschema'),
    _ = require('underscore');

/**
 * Load and validate a card file
 * @param identifier Identifier of the card file
 * @param filename Filename of the card file
 */
function loadCardFile(identifier, filename) {
    console.log('Loading ' + identifier + ': ' + filename);
    if (fs.existsSync(filename)) {
        var data = require(filename);
        validator.validate(data, schema, function (errors) {
            if (errors) {
                console.error(identifier + ': Validation error');
                console.error(errors);
            } else {
                console.log(identifier + ': Validation OK!');
                config.cards = _.union(config.cards, data);
            }
        });
    } else {
        console.error('File does not exists');
    }
}

// Initialize base configuration and ENV
var config = _.extend(
    require(__dirname + '/../config/env/all.js'),
    require(__dirname + '/../config/env/' + process.env.NODE_ENV + '.json') || {},
    { cards: [] }
);

// check custom card files and create them if they don't exist
if (!fs.existsSync(__dirname + '/../config/cards/Custom_a.json')) {
    fs.writeFileSync(__dirname + '/../config/cards/Custom_a.json', '[]');
}
if (!fs.existsSync(__dirname + '/../config/cards/Custom_q.json')) {
    fs.writeFileSync(__dirname + '/../config/cards/Custom_q.json', '[]');
}

// All card file paths. You can comment out the ones you don't want to use.
var cardFiles = {
    // Base Set
    OfficialBaseSetQuestions: __dirname + '/../config/cards/OfficialBaseSet_questions.json',
    OfficialBaseSetAnswers: __dirname + '/../config/cards/OfficialBaseSet_answers.json',

    // Official First Expansion
    Official1stExpansionQuestions: __dirname + '/../config/cards/Official1stExpansion_questions.json',
    Official1stExpansionAnswers: __dirname + '/../config/cards/Official1stExpansion_answers.json',

    // Official Second Expansion
    Official2ndExpansionQuestions: __dirname + '/../config/cards/Official2ndExpansion_questions.json',
    Official2ndExpansionAnswers: __dirname + '/../config/cards/Official2ndExpansion_answers.json',

    // Official Third Expansion
    Official3rdExpansionQuestions: __dirname + '/../config/cards/Official3rdExpansion_questions.json',
    Official3rdExpansionAnswers: __dirname + '/../config/cards/Official3rdExpansion_answers.json',

    // Official Fourth Expansion
    Official4thExpansionQuestions: __dirname + '/../config/cards/Official4thExpansion_questions.json',
    Official4thExpansionAnswers: __dirname + '/../config/cards/Official4thExpansion_answers.json',

    // Official Fifth Expansion
    Official5thExpansionQuestions: __dirname + '/../config/cards/Official5thExpansion_questions.json',
    Official5thExpansionAnswers: __dirname + '/../config/cards/Official5thExpansion_answers.json',

    // Official 2012 Holiday Expansion
    Official2012HolidayExpansionQuestions: __dirname + '/../config/cards/Official2012HolidayExpansion_questions.json',
    Official2012HolidayExpansionAnswers: __dirname + '/../config/cards/Official2012HolidayExpansion_answers.json',

    // Official 2013 Holiday Expansion
    Official2013HolidayExpansionQuestions: __dirname + '/../config/cards/Official2013HolidayExpansion_questions.json',
    Official2013HolidayExpansionAnswers: __dirname + '/../config/cards/Official2013HolidayExpansion_answers.json',

    // Official 90's Nostalgia Expansion
    Official90sNostalgiaExpansionQuestions: __dirname + '/../config/cards/90sNostalgiaExpansion_questions.json',
    Official90sNostalgiaExpansionAnswers: __dirname + '/../config/cards/90sNostalgiaExpansion_answers.json',

    // Bigger Blacker Box Expansion
    OfficialBoxExpansionAnswers: __dirname + '/../config/cards/OfficialBoxExpansion_answers.json',

    // Reject Expasnion
    RejectExpansionQuestions: __dirname + '/../config/cards/RejectExpansion_questions.json',
    RejectExpansionAnswers: __dirname + '/../config/cards/RejectExpansion_answers.json',

    // Game of Thrones Set
    GameOfThronesExpansionQuestions: __dirname + '/../config/cards/GameOfThronesExpansion_questions.json',
    GameOfThronesExpansionAnswers: __dirname + '/../config/cards/GameOfThronesExpansion_answers.json',

    // House of Cards Against Humanity Set
    HouseOfCardsAgainstHumanityQuestions: __dirname + '/../config/cards/HouseOfCardsAgainstHumanityExpansion_questions.json',
    HouseOfCardsAgainstHumanityAnswers: __dirname + '/../config/cards/HouseOfCardsAgainstHumanityExpansion_answers.json',

    // PAX East 2013 Set
    PAXEast2013ExpansionQuestions: __dirname + '/../config/cards/PAXEast2013Expansion_questions.json',
    PAXEast2013ExpansionAnswers: __dirname + '/../config/cards/PAXEast2013Expansion_answers.json',

    // PAX Prime 2013 Set
    PAXPrime2013ExpansionQuestions: __dirname + '/../config/cards/PAXPrime2013Expansion_questions.json',
    PAXPrime2013ExpansionAnswers: __dirname + '/../config/cards/PAXPrime2013Expansion_answers.json',

    // PAX East 2014 Set
    PAXEast2014ExpansionQuestions: __dirname + '/../config/cards/PAXEast2014Expansion_questions.json',
    PAXEast2014ExpansionAnswers: __dirname + '/../config/cards/PAXEast2014Expansion_answers.json',

    // PAX East Panel 2014 Set
    PAXEastPanel2014ExpansionQuestions: __dirname + '/../config/cards/PAXEastPanel2014Expansion_questions.json',
    PAXEastPanel2014ExpansionAnswers: __dirname + '/../config/cards/PAXEastPanel2014Expansion_answers.json',

    // PAX Prime Panel 2014 Set
    PAXPrimePanel2014ExpansionQuestions: __dirname + '/../config/cards/PAXPrimePanel2014Expansion_questions.json',
    PAXPrimePanel2014ExpansionAnswers: __dirname + '/../config/cards/PAXPrimePanel2014Expansion_answers.json',

    // Not Safe For Humanity Expansion
    NotSafeForHumanityExpansionQuestions: __dirname + '/../config/cards/NotSafeForHumanityExpansion_questions.json',
    NotSafeForHumanityExpansionAnswers: __dirname + '/../config/cards/NotSafeForHumanityExpansion_answers.json',

    // Doctor Who Expansion
    DoctorWhoExpansionQuestions: __dirname + '/../config/cards/DoctorWhoExpansion_questions.json',
    DoctorWhoExpansionAnswers: __dirname + '/../config/cards/DoctorWhoExpansion_answers.json',

    // Redbrick set
    // RedbrickQuestions: __dirname + '/../config/cards/Redbrick'
    RedbrickAnswers: __dirname + '/../config/cards/Redbrick_answers.json',

    // Original Bot Author Set
    BGGQuestions: __dirname + '/../config/cards/BGG_q.json',
    BGGAnswers: __dirname + '/../config/cards/BGG_a.json',
    BGGAmericaQuestions: __dirname + '/../config/cards/BGGAmerica_q.json',

    // Custom Questions
    CustomQuestions: __dirname + '/../config/cards/Custom_q.json'
};

// Init validator
var validator = new JaySchema();
// Define schema to calidate against
var schema = {
    "$schema": "http://json-schema.org/draft-04/schema#",
    "title": "Card Schema",
    "type": "array",
    "items": {
        "title": "Single card",
        "type": "object",
        "properties": {
            "type": {
                "description": "Type of the card (question or answer",
                "type": "string"
            },
            "value": {
                "description": "The text value of the card",
                "type": "string"
            },
            "keep": {
                "type": "string"
            },
            "draw": {
                "description": "Amount of cards that should be drawn from the deck when this card is in play",
                "type": "integer"
            },
            "pick": {
                "description": "Amount of cards that should be picked from the hand when this card is in play",
                "type": "integer"
            },
            "source": {
                "description": "Source of the card (e.g. expansion, community etc)",
                "type": "string"
            }
        },
        "required": ["value", "type", "pick", "draw"]
    }
};


// Validate and load cards files
console.log('Loading card data...');
for (var i in cardFiles) {
    if (cardFiles.hasOwnProperty(i)) {
        loadCardFile(i, cardFiles[i]);
    }
}

module.exports = config;
