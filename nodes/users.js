module.exports = function(RED) {
    'use strict';

    const Promise = require('bluebird');    
    const Redmine = require('node-redmine');
    const _ = require('lodash');

    function UsersNode(config) {
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

        // Property
        function retrieveProperty(msg, path, propertyName, isRequired = false) {
            return new Promise((resolve, reject) => {
                if (!path && isRequired) {
                    return reject(new Error(`${propertyName} property must be specified`));
                }
                resolve(path ? _.get(msg, path) : undefined);
            });
        }

        // filter
        function retrieveFilter(msg, path) {
            return retrieveProperty(msg, path, "Filter")
                .then((filter) => {
                    if (_.isObject(filter)) {
                        return filter;
                    }
                    if (_.isUndefined(filter)) {
                        return {};
                    }
                    throw new Error(`msg.${path} must be an object or undefined`);
                });
        }

        // User ID
        function retrieveUserId(msg, path) {
            return retrieveProperty(msg, path, "User ID", true)
                .then((value) => {
                    if (_.isNumber(value) || _.isString(value)) {
                        var userId = Number(value);
                        if (userId > 0 && _.isFinite(userId)) {
                            return userId;
                        }
                        throw new Error("Invalid user ID: " + value);
                    }
                    throw new Error(`msg.${path} must be a number`);
                });
        }

        // User attributes
        function retrieveUserAttributes(msg, path) {
            return retrieveProperty(msg, path, "User attributes", true)
                .then((userAttributes) => {
                    if (_.isObject(userAttributes)) {
                        return userAttributes;
                    }
                    throw new Error(`msg.${path} must be an object`);
                });
        }

        // Include
        function retrieveIncludes(config) {
            return new Promise((resolve, reject) => {
                var result = null;
                const flags = {
                    includeMemberships: "memberships",
                    includeGroups: "groups"
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
            // Listing users
            "list": function listUsers(msg) {
                node.status({fill:"blue", shape:"ring", text:"listing"});
                return retrieveFilter(msg, config.filter)
                    .then(Promise.coroutine(function* (params) {
                        var redmine = createClient(config, msg),
                            users = [],
                            total_count = 0;
                        params.limit = 100;
                        params.offset = users.length;
                        do {
                            let data = yield Promise.promisify(redmine.users, {context: redmine})(params);
                            if (data && _.isArray(data.users) && _.isNumber(data.total_count)) {
                                if (total_count == data.total_count || total_count === 0) {
                                    users = _.concat(users, data.users);
                                    total_count = data.total_count;
                                } else {
                                    // Users were added/deleted while fetching. Retry
                                    users = [];
                                    total_count = 0;
                                }
                            }
                        } while (users.length < total_count);

                        msg.payload = users;
                        msg.total_count = total_count;
                        return msg;
                    }));
            },

            // Showing a user
            "get": function getUser(msg) {
                node.status({fill:"blue", shape:"ring", text:"getting"});
                return Promise.all([
                    retrieveUserId(msg, config.userId),
                    retrieveIncludes(config)
                ])
                .then((results) => {
                    var redmine = createClient(config, msg);
                    return Promise.promisify(redmine.get_user_by_id, {context: redmine})(...results);
                })
                .then((data) => {
                    msg.payload = data.user;
                    return msg;
                });
            },

            // Creating a user
            "create": function createUser(msg) {
                node.status({fill:"blue", shape:"ring", text:"creating"});
                return retrieveUserAttributes(msg, config.userAttributes)
                    .then((attributes) => {
                        var redmine = createClient(config, msg);
                        return Promise.promisify(redmine.create_user, {context: redmine})({
                            user: attributes,
                            send_information: !!config.sendInformation
                        });
                    })
                    .then((data) => {
                        msg.payload = data.user;
                        return msg;
                    });
            },
    
            // Updating a user
            "update": function updateUser(msg) {
                node.status({fill:"blue", shape:"ring", text:"updating"});
                return Promise.all([
                    retrieveUserId(msg, config.userId),
                    retrieveUserAttributes(msg, config.userAttributes)
                ])
                .then(([userId, attributes]) => {
                    var redmine = createClient(config, msg);
                    return Proise.promisify(redmine.update_user, {context: redmine})(userId, { user: attributes });
                })
                .then((data) => {
                    return msg;
                });
            },

            // Deleting a user
            "delete": function deleteUser(msg) {
                node.status({fill:"blue", shape:"ring", text:"deleting"});
                return retrieveUserId(msg, config.userId)
                    .then((userId) => {
                        var redmine = createClient(config, msg);
                        return Promise.promisify(redmine.delete_user, {context: redmine})(userId);
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
    RED.nodes.registerType("users",UsersNode);
}
