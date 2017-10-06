module.exports = function(RED) {
    'use strict';

    function RedmineServerNode(n) {
        RED.nodes.createNode(this, n);
        this.url = n.url;
        this.key = n.key;
    }

    RED.nodes.registerType("redmine-server", RedmineServerNode);
}
