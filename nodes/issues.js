module.exports = function(RED) {
    'use strict';

    const Promise = require('bluebird');    
    const Redmine = require('node-redmine');
    const _ = require('lodash');

    function IssuesNode(config) {
        RED.nodes.createNode(this,config);
        var node = this;

        function createClient(config, msg) {
            var server = RED.nodes.getNode(config.server);
            var redmine = new Redmine(server.url, {
                apiKey: server.key,
                impersonate: _.get(msg, server.impersonate)
            });
            if (!_.hasIn(redmine, 'impersonate')) {
                Object.defineProperty(redmine, 'impersonate', {
                    get: function() {
                        return this.config.impersonate;
                    },
                    set: function(username) {
                        this.config.impersonate = username;
                    }
                });
            }
            return redmine;
        }

        // Issue ID
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

        // Parameters
        function retrieveParameters(msg, path) {
            return new Promise((resolve, reject) => {
                var params = _.get(msg, path);
                if (!_.isObject(params)) {
                    reject(new Error(`msg.${path} must be an object`));
                } else {
                    resolve(params);
                }
            });
        }

        // Include
        function retrieveIncludes(config) {
            return new Promise((resolve, reject) => {
                var result = null;
                const flags = {
                    includeChildren: "children",
                    includeAttachments: "attachments",
                    includeRelations: "relations",
                    includeChangesets: "changesets",
                    includeJournals: "journals",
                    includeWatchers: "watchers"
                };
                for (var p in flags) {
                    if (config[p]) {
                        if (result) {
                            result += ',' + flags[p];
                        } else {
                            result = flags[p];
                        }
                    }
                }
                resolve({include:result});
            });
        }

        const modes = {
            // Listing issues
            "list": function listIssues(msg) {
                node.status({fill:"blue", shape:"ring", text:"listing"});
                var allIssues = config.allIssues;
                return retrieveParameters(msg, config.paramsProperty)
                    .then(Promise.coroutine(function* (params) {
                        var redmine = createClient(config, msg),
                            issues = [],
                            total_count = 0;
                        if (allIssues) {
                            params.limit = 100;
                            params.offset = issues.length;
                        }
                        do {
                            let data = yield Promise.promisify(redmine.issues, {context: redmine})(params);
                            if (data && _.isArray(data.issues) && _.isNumber(data.total_count)) {
                                if (total_count == data.total_count || total_count === 0) {
                                    issues = _.concat(issues, data.issues);
                                    total_count = data.total_count;
                                } else {
                                    // Issues were added/deleted while fetching. Retry
                                    issues = [];
                                    total_count = 0;
                                }
                            }
                        } while (allIssues && issues.length < total_count);

                        msg.payload = issues;
                        msg.total_count = total_count;
                        return msg;
                    }));
            },

            // Showing an issue
            "get": function getIssue(msg) {
                node.status({fill:"blue", shape:"ring", text:"getting"});
                return Promise.all([
                    retrieveIssueId(msg, config.issueIdProperty),
                    retrieveIncludes(config)
                ])
                .then((results) => {
                    var redmine = createClient(config, msg);
                    return Promise.promisify(redmine.get_issue_by_id, {context: redmine})(results[0], results[1]);
                })
                .then((data) => {
                    msg.payload = data.issue;
                    return msg;
                });
            },

            // Creating an issue
            "create": function createIssue(msg) {
                node.status({fill:"blue", shape:"ring", text:"creating"});
                return retrieveParameters(msg, config.paramsProperty)
                    .then((params) => {
                        var redmine = createClient(config, msg);
                        return Promise.promisify(redmine.create_issue, {context: redmine})({issue:params});
                    })
                    .then((data) => {
                        msg.payload = data.issue;
                        return msg;
                    });
            },
    
            // Updating an issue
            "update": function updateIssue(msg) {
                node.status({fill:"blue", shape:"ring", text:"updating"});
                return Promise.all([
                    retrieveIssueId(msg, config.issueIdProperty),
                    retrieveParameters(msg, config.paramsProperty)
                ])
                .then((results) => {
                    var redmine = createClient(config, msg);
                    return Promise.promisify(redmine.update_issue, {context: redmine})(results[0], results[1]);
                })
                .then((data) => {
                    return msg;
                });
            },

            // Deleting an issue
            "delete": function deleteIssue(msg) {
                node.status({fill:"blue", shape:"ring", text:"deleting"});
                return retrieveIssueId(msg, config.issueIdProperty)
                    .then((issueId) => {
                        var redmine = createClient(config, msg);
                        return Promise.promisify(redmine.delete_issue, {context: redmine})(issueId);
                    })
                    .then((data) => {
                        return msg;
                    });
            },

            // Adding a watcher
            "addWatcher": function addWatcher(msg) {
                node.status({fill:"blue", shape:"ring", text:"adding a watcher"});
                return retrieveIssueId(msg, config.issueIdProperty)
                    .then((issueId) => {
                        var redmine = createClient(config, msg);
                        return Promise.promisify(redmine.add_watcher, {context: redmine})(issueId, msg.payload);
                    })
                    .then((data) => {
                        return msg;
                    });
            },

            // Removing a watcher
            "removeWatcher": function removeWatcher(msg) {
                node.status({fill:"blue", shape:"ring", text:"removing a watcher"});
                return retrieveIssueId(msg, config.issueIdProperty)
                    .then((issueId) => {
                        var redmine = createClient(config, msg);
                        return Promise.promisify(redmine.remove_watcher, {context: redmine})(issueId, msg.user_id);
                    })
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
