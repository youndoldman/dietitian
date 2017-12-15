'use strict';

const request = require('request');
const mecab = require('mecabaas-client');
const debug = require("debug")("bot-express:service");
const Salesforce = require("../service/salesforce");
const db = new Salesforce();
const dbPrefix = process.env.FOOD_DB_API_BASE;
const TextMiner = require('./textMiner');
Promise = require('bluebird');
Promise.promisifyAll(request);

module.exports = class ServiceFood {

    static extract_food_list_with_nutrition_by_text(text){
        debug("Going to process message by mecab...");
        return mecab.parse(text).then((parsed_text) => {
            let food_list = TextMiner.extractFoodList(parsed_text);

            if (food_list.length == 0){
                console.log('Mecab did not recognize noun.');
                return [];
            }

            // 食品リストの食品それぞれについて、栄養情報を取得する。
            debug('Going to get food list with nutrition.');
            return ServiceFood.get_food_list_with_nutrition(food_list, false);
        });
    }

    static saveFood(food){
        return new Promise(function(resolve, reject){
            const headers = {
                'Content-Type': 'application/json'
            };
            const url = dbPrefix + '/food';
            request({
                url: url,
                method: 'POST',
                headers: headers,
                body: food,
                json: true
            }, function (error, response, body) {
                if (error){
                    reject(error);
                    return;
                }
                if (response.statusCode != 200){
                    reject({message:'Failed to save food.'});
                    return;
                }
                resolve();
                return;
            });
        });
    }

    static deleteFood(foodName){
        return new Promise(function(resolve, reject){
            const headers = {
                'Content-Type': 'application/json'
            };
            const url = dbPrefix + '/food';
            request({
                url: url,
                method: 'DELETE',
                headers: headers,
                body: {food_name: foodName},
                json: true
            }, function (error, response, body) {
                if (error){
                    reject(error);
                    return;
                }
                if (response.statusCode != 200){
                    reject({message:'Failed to delete food.'});
                    return;
                }
                resolve();
                return;
            });
        });
    }

    static registerFood(food){
        return new Promise(function(resolve, reject){
            // 新しい食品を登録
            food.unidentified = 0;
            ServiceFood.saveFood(food)
            .then(
                function(){
                    // 同名のUnidentified Foodを削除
                    return ServiceFood.deleteFood(food.food_name);
                },
                function(error){
                    return Promise.reject(error);
                }
            )
            .then(
                function(){
                    resolve();
                    return;
                },
                function(error){
                    reject(error);
                    return;
                }
            );
        });
    }

    static getUnidentifiedFoodList(){
        return new Promise(function(resolve, reject){
            const headers = {
                'Content-Type': 'application/json'
            };
            const url = dbPrefix + '/food/list/unidentified';
            request({
                url: url,
                method: 'GET',
                headers: headers,
                json: true
            }, function (error, response, body) {
                if (error){
                    reject(error);
                    return;
                }
                if (typeof body.items == 'undefined'){
                    reject({message:'Failed to get unidentified foods. It seems FoodDb is out of order.'});
                    return;
                }
                resolve(body.items);
                return;
            });
        });
    }

    static saveUnidentifiedFood(food){
        return new Promise(function(resolve, reject){
            const headers = {
                'Content-Type': 'application/json'
            };
            const url = dbPrefix + '/food/unidentified';
            request({
                url: url,
                method: 'POST',
                headers: headers,
                body: {food_name: food},
                json: true
            }, function (error, response, body) {
                if (error){
                    reject(error);
                    return;
                }
                if (response.statusCode != 200){
                    reject({message: 'Failed to save ' + food + ' to unidentified food db.'});
                    return;
                }
                resolve();
                return;
            });
        });
    }

    static saveUnidentifiedFoodList(foodList){
        let savedFoodList = [];
        for (let food of foodList){
            savedFoodList.push(ServiceFood.saveUnidentifiedFood(food));
        }
        return new Promise(function(resolve, reject){
            Promise.all(savedFoodList)
            .then(
                function(){
                    resolve();
                    return;
                },
                function(error){
                    reject(error);
                    return;
                }
            );
        });
    }

    static get_food_list_with_nutrition(foodList, autoSaveUnidentifiedFoodList){
        if (typeof foodList != 'object' || typeof foodList.length != 'number'){
            return Promise.reject({message:'foodList is invalid.'});
        }

        if (foodList.length > 10){
            return Promise.reject({message:'foodList can contain less than or equal to 10 foods. Provided ' + foodList.length + '.'});
        }

        let done_get_all_food_with_nutrition = [];
        foodList.map((food) => {
            done_get_all_food_with_nutrition.push(ServiceFood.get_food_with_nutrition(food));
        });

        return Promise.all(done_get_all_food_with_nutrition).then((food_with_nutrition_list) => {
            let unidentified_food_id_list= [];
            let identified_food_id_list = [];

            for (let food_with_nutrition of ffood_with_nutrition_list){
                if (food_with_nutrition.food_id_list.length > 0){
                    // 可能性のある食品が一つ以上特定された場合。仮の実装でindexが0の食品を返している。
                    identified_food_id_list.push(food_with_nutrition.food_id_list[0]);
                } else {
                    // 食品が特定できなかった場合
                    unidentified_food_id_list.push(food_with_nutrition.food_name);
                }
            }

            if (identified_food_id_list.length == 0){
                debug('We could not identify any of the food you provided.');
            } else {
                debug('Here are the foods we identified.');
                debug(identified_food_id_list);
            }

            return identified_food_id_list;

            /*
            if (autoSaveUnidentifiedFoodList && unidentifiedFoodList.length > 0){
                console.log("We got some unidentified foods so saving them to db...");
                ServiceFood.saveUnidentifiedFoodList(unidentifiedFoodList)
                .then(
                    function(){
                        resolve(identifiedFoodList);
                        return;
                    },
                    function(error){
                        console.log("Failed to save unidentified foods.");
                        reject(error);
                        return;
                    }
                );
            } else {
                return identifiedFoodList;
            }
            */
        });
    }

    static get_food_with_nutrition(food_name){
        let query = `select id from diet_food__c where food_name like '%${food_name}%'`;
        return db.query(query).then((response) => {
            let food_with_nutrition = {
                food_name: food_name,
                food_id_list: []
            };
            response.records.map((f) => {
                food_with_nutrition.food_id_list.push(f.id);
            });
            return food_with_nutrition;
        });
    }

};