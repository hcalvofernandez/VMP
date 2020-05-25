/**********************************************************************************
*
*    Copyright (c) 2017-2019 MuK IT GmbH.
*
*    This file is part of MuK Backend Theme Website 
*    (see https://mukit.at).
*
*    MuK Proprietary License v1.0
*
*    This software and associated files (the "Software") may only be used 
*    (executed, modified, executed after modifications) if you have
*    purchased a valid license from MuK IT GmbH.
*
*    The above permissions are granted for a single database per purchased 
*    license. Furthermore, with a valid license it is permitted to use the
*    software on other databases as long as the usage is limited to a testing
*    or development environment.
*
*    You may develop modules based on the Software or that use the Software
*    as a library (typically by depending on it, importing it and using its
*    resources), but without copying any source code or material from the
*    Software. You may distribute those modules under the license of your
*    choice, provided that this license is compatible with the terms of the 
*    MuK Proprietary License (For example: LGPL, MIT, or proprietary licenses
*    similar to this one).
*
*    It is forbidden to publish, distribute, sublicense, or sell copies of
*    the Software or modified copies of the Software.
*
*    The above copyright notice and this permission notice must be included
*    in all copies or substantial portions of the Software.
*
*    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
*    OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
*    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
*    THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
*    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
*    FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
*    DEALINGS IN THE SOFTWARE.
*
**********************************************************************************/

odoo.define('muk_web_theme_website.WebsiteNavbar', function (require) {
"use strict";

var core = require('web.core');
var config = require("web.config");
var session = require("web.session");

var navbar = require("website.navbar");
var MenuSearchMixin = require("muk_web_theme.MenuSearchMixin");

var _t = core._t;
var QWeb = core.qweb;

navbar.WebsiteNavbar.include(_.extend({}, MenuSearchMixin, {
	xmlDependencies: (navbar.WebsiteNavbar.prototype.xmlDependencies || []).concat([
		'/muk_web_theme/static/src/xml/apps.xml'
	]),
    events: _.extend({}, navbar.WebsiteNavbar.prototype.events, {
        "keydown .mk_search_input input": "_onSearchResultsNavigate",
        "click .mk_menu_search_result": "_onSearchResultChosen",
        "shown.bs.dropdown": "_onMenuShown",
        "hidden.bs.dropdown": "_onMenuHidden",
    }),
    init: function (parent) {
        this._super.apply(this, arguments);
        this._search_def = $.Deferred();
    },
    willStart: function() {
      	var load_menus = this._rpc({
            model: 'ir.ui.menu',
            method: 'load_menus',
            args: [config.debug],
            context: session.user_context,
        }).then(function (menuData) {
            for (var i = 0; i < menuData.children.length; i++) {
                var child = menuData.children[i];
                if (child.action === false) {
                    while (child.children && child.children.length) {
                        child = child.children[0];
                        if (child.action) {
                            menuData.children[i].action = child.action;
                            break;
                        }
                    }
                }
            }
            this._searchableMenus = _.reduce(
                menuData.children, this._findNames.bind(this), {}
            );
        }.bind(this));
      	var load_config = this._rpc({
            route: '/config/muk_web_theme.background_blend_mode',
        }).done(function(result) {
        	this.background_blend_mode = result.background_blend_mode;
        }.bind(this));
    	return $.when(this._super.apply(this, arguments), load_menus, load_config)
    },
	start: function () {
        this._setBackgroundImage();
        this.$menu_icon = this.$("a.full > i.fa");
        this.$search_container = this.$(".mk_search_container");
        this.$search_input = this.$(".mk_search_input input");
        this.$search_results = this.$(".mk_search_results");
        return this._super.apply(this, arguments);
    },
    _onSearchResultChosen: function (event) {
        event.preventDefault();
        var data = $(event.currentTarget).data();
        this.$menu_icon.removeClass('fa-th').addClass('fa-spin fa-spinner')
        var url = _.str.sprintf('/web#menu_id=%s&amp;action=%s', data.menuId, data.actionId);
        window.location.href = session.debug ? $.param.querystring(url, {debug: session.debug}) : url;
    },
    _setBackgroundImage: function () {
    	var $menu = this.$('#oe_applications .dropdown-menu');
    	var url = session.url('/web/image', {
            model: 'res.company',
            field: 'background_image',
            id: $menu.data('company-id') || 1,
        });
    	$menu.css({
            "background-size": "cover",
            "background-image": "url(" + url + ")"
        });
    	this.$('.mk_website_app_name').css({
    		"mix-blend-mode": this.background_blend_mode,
    	});
    },
}));

});