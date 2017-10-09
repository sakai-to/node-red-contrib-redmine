module.exports = function(RED) {
    'use strict';

    const Promise = require('bluebird');    
    const Redmine = require('node-redmine');
    const _ = require('lodash');

    function IssuesNode(config) {
        RED.nodes.createNode(this,config);
        var node = this;
        var server = RED.nodes.getNode(config.server);

        var redmine = new Redmine(server.url, {apiKey: server.key});
        redmine = Promise.promisifyAll(redmine, {suffix:"_async"});

        function retrieveIssueId(msg, path) {
            return new Promise((resolve, reject) => {
                var issueIdStr = _.get(msg, path);
                if (!_.isNumber(issueIdStr) && !_.isString(issueIdStr)) {
                    reject(new Error(`msg.${path} must be a number`));
                } else {
                    var issueId = Number(issueIdStr);
                    if (issueId > 0) {
                        resolve(issueId);
                    } else {
                        reject(new Error("Invalid issue ID: " + issueIdStr));
                    }
                }
            });
        }

        const modes = {
            // Listing issues
            "list": function listIssues(msg) {
                node.status({fill:"blue", shape:"ring", text:"listing"});
                return redmine.issues_async(msg.payload)
                    .then((data) => {
                        msg.payload = data.issues;
                        msg.total_count = data.total_count;
                        return msg;
                    });
            },

            // Showing an issue
            "get": function getIssue(msg) {
                node.status({fill:"blue", shape:"ring", text:"getting"});
                return retrieveIssueId(msg, config.issueIdProperty)
                    .then((issue_id) => redmine.get_issue_by_id_async(issue_id, msg.payload))
                    .then((data) => {
                        msg.payload = data.issue;
                        return msg;
                    });
            },

            // Creating an issue
            "create": function createIssue(msg) {
                node.status({fill:"blue", shape:"ring", text:"creating"});
                return redmine.create_issue_async(msg.payload)
                    .then((data) => {
                        msg.payload = data.issue;
                        return msg;
                    });
            },
    
            // Updating an issue
            "update": function updateIssue(msg) {
                node.status({fill:"blue", shape:"ring", text:"updating"});
                return retrieveIssueId(msg, config.issueIdProperty)
                    .then((issueId) => redmine.update_issue_async(issueId, msg.payload))
                    .then((data) => {
                        return msg;
                    });
            },

            // Deleting an issue
            "delete": function deleteIssue(msg) {
                node.status({fill:"blue", shape:"ring", text:"deleting"});
                return retrieveIssueId(msg, config.issueIdProperty)
                    .then((issueId) => redmine.delete_issue_async(msg.issue_id))
                    .then((data) => {
                        return msg;
                    });
            },

            // Adding a watcher
            "addWatcher": function addWatcher(msg) {
                node.status({fill:"blue", shape:"ring", text:"adding a watcher"});
                return retrieveIssueId(msg, config.issueIdProperty)
                    .then((issueId) => redmine.add_watcher_async(issueId, msg.payload))
                    .then((data) => {
                        return msg;
                    });
            },

            // Removing a watcher
            "removeWatcher": function removeWatcher(msg) {
                node.status({fill:"blue", shape:"ring", text:"removing a watcher"});
                return retrieveIssueId(msg, config.issueIdProperty)
                    .then((issueId) => redmine.remove_watcher_async(issueId, msg.user_id))
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
