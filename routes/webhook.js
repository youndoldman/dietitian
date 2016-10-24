'use strict';

const express = require('express');
const router = express.Router();
const cache = require('memory-cache');
const crypto = require('crypto');
const Promise = require('bluebird');
const TextMiner = require('../textMiner');
const FoodDb = require('../foodDb');
const PersonalHistoryDb = require('../personalHistoryDb');
const LineBot = require('../lineBot');

router.post('/', (req, res, next) => {

    // Signature Validation
    if (!LineBot.validateSignature(req.get('X-Line-Signature'), req.rawBody)){
        return res.status(401).send('Signature validation failed.');
    }
    console.log('Signature validation succeeded.');

    // Webhookへのリクエストから必要な情報を抜き出す。
    let message = req.body.events[0].message.text;
    let line_id = req.body.events[0].source.userId;
    let replyToken = req.body.events[0].replyToken;

    // ユーザー情報を取得する。
    PersonalHistoryDb.getPerson(line_id)
    .then(
        function(person){
            console.log(person);
            // メッセージから食品を抽出する。
            TextMiner.getFoodListFromMessage(message);
        },
        function(error){
            return Promise.reject(error);
        }
    )
    .then(
        function(foodList){
            // 食品リストの食品それぞれについて、栄養情報を取得する。
            return FoodDb.getFoodListWithNutrition(foodList);
        },
        function(error){
            console.log(error.message);
            return Promise.reject(error);
        }
    ).then(
        function(foodListWithNutrition){
            // 食品リスト(栄養情報含む）をユーザーの食事履歴に保存する。
            let dietDate = '2016-10-24';
            let dietType = 'dinner';
            return PersonalHistoryDb.saveFoodListAsDietHistory(person.line_id, dietDate, dietType, foodListWithNutrition);
        },
        function(error){
            console.log(error.message);
            return Promise.reject(error);
        }
    ).then(
        function(savedDietHistoryList){
            // WebSocketを通じて更新を通知
            let channel = cache.get(person.line_id);
            if (channel){
                channel.emit('personalHistoryUpdated', savedDietHistoryList);
            }

            // 残り必要カロリーを取得。
            return PersonalHistoryDb.getCalorieToGo(person.line_id, person.birthday, person.height);
        },
        function(error){
            return Promise.reject(error);
        }
    ).then(
        function(calorieToGo){
            console.log(calorieToGo);
            // メッセージをユーザーに送信。
            if (calorieToGo > 0){
                let message = '満タンまであと' + calorieToGo + 'kcalですよー。';
            } else if (calorieToGo < 0){
                let message = 'ぎゃー食べ過ぎです。' + calorieToGo * -1 + 'kcal超過してます。';
            } else if (calorieToGo == 0){
                let message = 'カロリー、ちょうど満タンです！';
            } else {
                let message = 'あれ、満タンまであとどれくらいだろう・・';
            }
            return LineBot.reply(replyToken, message);
        },
        function(error){
            return Promise.reject(error);
        }
    ).then(
        function(response){
            // コール元のLineにステータスコード200を返す。常に200を返さなければならない。
            console.log(response);
            return res.status(200).end();
        },
        function(error){
            console.log(error);
            return res.status(200).end();
        }
    );
});

router.get('/test', (req, res, next) => {

    // 仮のテスト用データ
    let message = '納豆';
    let person = {
        line_id: 'U35df722ecd249c60b104ee32448bfaae',
    }

    // テキストメッセージから食品リストを抽出する。
    TextMiner.getFoodListFromMessage(message)
    .then(
        function(foodList){
            // 食品リストの食品それぞれについて、栄養情報を取得する。
            return FoodDb.getFoodListWithNutrition(foodList);
        },
        function(error){
            console.log(error.message);
            Promise.reject(error);
        }
    ).then(
        function(foodListWithNutrition){
            // 食品リスト(栄養情報含む）をユーザーの食事履歴に保存する。
            let dietDate = '2016-10-24';
            let dietType = 'breakfast';
            return PersonalHistoryDb.saveFoodListAsDietHistory(person.line_id, dietDate, dietType, foodListWithNutrition);
        },
        function(error){
            console.log(error.message);
            Promise.reject(error);
        }
    ).then(
        function(savedDietHistoryList){

            // WebSocketを通じて更新を通知
            let channel = cache.get(person.line_id);
            if (channel){
                channel.emit('personalHistoryUpdated', savedDietHistoryList);
            }

            // 完了メッセージをユーザーに送信。
            // *personは存在している前提
            /*
            let message = ''; // 栄養摂取状況にもとづいたメッセージを作成。
            LineBot.sendMessage(person, message);
            */

            res.status(200).end();
        },
        function(error){
            console.log(error.message);
            res.json(error);
        }
    );
});

module.exports = router;
