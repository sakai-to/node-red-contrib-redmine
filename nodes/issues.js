module.exports = function(RED) {
    'use strict';

    const Promise = require('bluebird');    
    const Redmine = require('node-redmine');
    const _ = require('lodash');

    function IssuesNode(config) {
        RED.nodes.createNode(this,config);
        var node = this;
        var server = RED.nodes.getNode(config.server);

        var redmine = Promise.promisifyAll(new Redmine(server.url, {
            apiKey: server.key
        }));

        const modes = {
            // Listing issues
            "list": function listIssues(msg) {
                node.status({fill:"blue", shape:"ring", text:"listing"});
                return redmine.issuesAsync(msg.payload)
                    .then((data) => {
                        msg.payload = data.issues;
                        msg.total_count = data.total_count;
                        return msg;
                    });
            },

            // Showing an issue
            "get": function getIssue(msg) {
                return new Promise(function (resolve, reject) {
                    node.status({fill:"blue", shape:"ring", text:"getting"});
                    var issue_id_str = _.get(msg, config.issueIdProperty);
                    if (!_.isNumber(issue_id_str) && !_.isString(issue_id_str)) {
                        reject(new Error(`msg.${config.issue_id} must be a number`));
                    } else {
                        var issue_id = Number(issue_id_str);
                        if (issue_id > 0) {
                            resolve(issue_id);
                        } else {
                            reject(new Error("Invalid issue ID: " + issue_id_str));
                        }
                    }
                })
                .then((issue_id) => redmine.get_issue_by_idAsync(issue_id, msg.payload))
                .then((data) => {
                    msg.payload = data.issue;
                    return msg;
                });
            },

            // Creating an issue
            "create": function createIssue(msg) {
                node.status({fill:"blue", shape:"ring", text:"creating"});
                return redmine.create_issueAsync(msg.payload)
                    .then((data) => {
                        msg.payload = data.issue;
                        return msg;
                    });
            },
    
            // Updating an issue
            "update": function updateIssue(msg) {
                node.status({fill:"blue", shape:"ring", text:"updating"});
                return redmine.update_issueAsync(msg.issue_id, msg.payload)
                    .then((data) => {
                        return msg;
                    });
            },

            // Deleting an issue
            "delete": function deleteIssue(msg) {
                node.status({fill:"blue", shape:"ring", text:"deleting"});
                return redmine.delete_issueAsync(msg.issue_id)
                    .then((data) => {
                        return msg;
                    });
            },

            // Adding a watcher
            "addWatcher": function addWatcher(msg) {
                node.status({fill:"blue", shape:"ring", text:"adding a watcher"});
                return redmine.add_watcherAsync(msg.issue_id, msg.payload)
                    .then((data) => {
                        return msg;
                    });
            },

            // Removing a watcher
            "removeWatcher": function removeWatcher(msg) {
                node.status({fill:"blue", shape:"ring", text:"removing a watcher"});
                return redmine.remove_watcherAsync(msg.issue_id, msg.user_id)
                    .then((data) => {
                        return msg;
                    });
            }
        };

        node.on('input', function(msg) {
            var func = modes[config.mode];
            if (!func) {
                return node.error(new Error("Illgal mode: " + config.mode), msg);
            }
            func(msg)
            .then(function (msg){
                node.send(msg);
                node.status({});
            })
            .catch(function (err) {
                node.error(err, msg);
                node.status({fill:"red", shape:"ring", text:"failed"});
            });
        });
    }
    RED.nodes.registerType("issues",IssuesNode);
}
