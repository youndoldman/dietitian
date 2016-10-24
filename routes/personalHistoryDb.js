'use strict';

const express = require('express');
const router = express.Router();
const cache = require('memory-cache');
const app = require('../app');
const PersonalHistoryDb = require('../personalHistoryDb');

router.get('/person/:personId/diet_history/today', (req, res, next) => {
    PersonalHistoryDb.getTodayHistory(req.params.personId)
    .then(
        function(history){
            res.json(history);
        },
        function(error){
            res.json(error);
        }
    );
});

module.exports = router;