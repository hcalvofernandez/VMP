/*
 *   Copyright (c) 2020 
 *   All rights reserved.
 */
odoo.define('flexibite_com_advance.screens', function (require) {
    "use strict";

    var screens = require('point_of_sale.screens');
    var gui = require('point_of_sale.gui');
    var models = require('point_of_sale.models');
    var rpc = require('web.rpc');
    var core = require('web.core');
    var PosBaseWidget = require('point_of_sale.BaseWidget');
    var field_utils = require('web.field_utils');
    var framework = require('web.framework');
    var utils = require('web.utils');

    var round_di = utils.round_decimals;
    var splitbill = require('pos_restaurant.splitbill').SplitbillButton;
    var QWeb = core.qweb;
    var _t = core._t;
    var session = require('web.session');

    function start_lock_timer(time_interval,self){
        var $area = $(document),
        idleActions = [{
            milliseconds: time_interval * 100000,
            action: function () {
                var params = {
                    model: 'pos.session',
                    method: 'write',
                    args: [self.pos.pos_session.id,{'is_lock_screen' : true}],
                }
                rpc.query(params, {async: false}).fail(function(){
                    self.pos.db.notification('danger',"Connection lost");
                });
                // $('.lock_button').css('background-color', 'rgb(233, 88, 95)');
                $('.freeze_screen').addClass("active_state");
                $(".unlock_button").fadeIn(2000);
                $('.unlock_button').show();
                $('.unlock_button').css('z-index',10000);
            }
        }];
        function lock (event, times, undefined) {
            var idleTimer = $area.data('idleTimer');
            if (times === undefined) times = 0;
            if (idleTimer) {
                clearTimeout($area.data('idleTimer'));
            }
            if (times < idleActions.length) {
                $area.data('idleTimer', setTimeout(function () {
                    idleActions[times].action();
                    lock(null, ++times);
                }, idleActions[times].milliseconds));
            } else {
                $area.off('mousemove click', lock);
            }
        };
        $area
            .data('idle', null)
            .on('mousemove click', lock);
        lock();
    }

    var table_reservation_button = screens.ActionButtonWidget.extend({
        template: 'AddTableReservationButton',
        button_click: function(){
            this.gui.show_screen('table_reservation_screen');
            if(this.pos.floors && this.pos.floors.length > 0){
                this.gui.show_screen('table_reservation_screen');
            }else{
                return self.pos.gui.show_popup('flexi_alert',{
                    'title':_t('Empty Floors'),
                    'body':_t("Floors not loaded in current point of sale."),
                });
            }
        },
    });
    screens.define_action_button({
        'name': 'tablereservationbutton',
        'widget': table_reservation_button,
        'condition': function(){
            return this.pos.config.table_reservation && (this.pos.get_cashier().user_role == 'cashier' || !this.pos.get_cashier().user_role);
        },
    });

    var LineNoteButton = screens.ActionButtonWidget.extend({
        template: 'LineNoteButton',
        button_click: function(){
            var line = this.pos.get_order().get_selected_orderline();
            if (line) {
                this.gui.show_popup('line_note_popup', {'line':line});
            }
        },
    });

    screens.define_action_button({
        'name': 'LineNoteButton',
        'widget': LineNoteButton,
        'condition': function(){
            return this.pos.config.iface_orderline_notes;
        },
    });

    screens.ActionpadWidget.include({
        renderElement: function() {
            var self = this;
            this._super();
            var order_count = self.pos.order_quick_draft_count;
            $('.notification-count').show();
            $('.draft_order_count').text(order_count);
            this.$('.pay').unbind('click').click(function(){
                var order = self.pos.get_order();
                var partner = self.pos.get_order().get_client();
                var has_valid_product_lot = _.every(order.orderlines.models, function(line){
                    return line.has_valid_product_lot();
                });
                if(partner){
                    var params = {
                    model: 'account.invoice',
                    method: 'get_outstanding_info',
                    args: [partner.id]
                    }
                    rpc.query(params, {async: false}).then(function(res){
                        if(res){
                            partner['deposite_info'] = res;
                            _.each(res['content'], function(value){
                                  self.pos.amount = value['amount'];
                            });
                        }
                    });
                }
                if(self.pos.get_cashier().user_role == "ass_cashier"){
                    var order = self.pos.get_order();
                    var lines = order.get_orderlines();
                    if(lines.length > 0){
                        return self.gui.show_popup('confirm',{
                            'title': _t('Send Order?'),
                            'body':  _t('Send order to kitchen?'),
                            confirm: function(){
                                if(!has_valid_product_lot){
                                    self.gui.show_popup('confirm',{
                                        'title': _t('Empty Serial/Lot Number'),
                                        'body':  _t('One or more product(s) required serial/lot number.'),
                                        confirm: function(){
                                            self.pos.chrome.screens.payment.unpaid_draft_order();
                                        },
                                    });
                                }else{
                                    var is_delivery_order = order.get_is_delivery();
                                    if(is_delivery_order){
                                        return self.gui.show_popup('delivery_info');
                                    }
                                    return self.pos.chrome.screens.products.send_to_kitchen();
//                                	return self.pos.chrome.screens.payment.unpaid_draft_order();
                                }
                            },
                        });
                    }else{
                        return self.pos.gui.show_popup('flexi_alert',{
                            'title':_t('Empty Order'),
                            'body':_t("There must be one product in your order before send it."),
                        });
                    }
                }
                if(!has_valid_product_lot){
                    self.gui.show_popup('confirm',{
                        'title': _t('Empty Serial/Lot Number'),
                        'body':  _t('One or more product(s) required serial/lot number.'),
                        confirm: function(){
                            self.gui.show_screen('payment');
                        },
                    });
                }else{
                    self.gui.show_screen('payment');
                }
            });
            this.$('.empty-cart').click(function(){
                var order = self.pos.get_order();
                var lines = order.get_orderlines();
                if(lines.length > 0){
                    self.gui.show_popup('confirm',{
                        'title': _t('Empty Cart ?'),
                        'body': _t('You will lose all items associated with the current order'),
                        confirm: function(){
                            order.empty_cart();
                            order.mirror_image_data();
                        },
                    });
                } else {
                    $('div.order-empty').animate({
                       color: '#FFCCCC',
                    }, 1000, 'linear', function() {
                         $(this).css('color','#DDD');
                    });
                }
            });
            this.$('.set-customer').click(function(){
                self.gui.show_screen('clientlist');
            });
        },
    });

    screens.ProductListWidget.include({
        init: function(parent, options) {
            var self = this;
            this._super(parent,options);
            this.model = options.model;
            this.productwidgets = [];
            this.weight = options.weight || 0;
            this.show_scale = options.show_scale || false;
            this.next_screen = options.next_screen || false;
            this.click_product_handler = function(e){
                var product = self.pos.db.get_product_by_id(this.dataset.productId);
                if(product){
                    if(self.pos.config.auto_close){
                        $('#slidemenubtn1').css({'right':'0px'});
                        $('.product-list-container').css('width','100%');
                        $('#wrapper1').addClass('toggled');
                    }
                    if($(e.target).attr('class') === "product-qty-low" || $(e.target).attr('class') === "product-qty"){
                        var prod = product;
                        var prod_info = [];
                        var total_qty = 0;
                        rpc.query({
                            model: 'stock.warehouse',
                            method: 'disp_prod_stock',
                            args: [
                                 prod.id,self.pos.shop.id
                            ]
                        }).then(function(result){
                        if(result){
                            prod_info = [];
                            total_qty = 0;
                            _.each(result[0],function(item){
                                if(item[2] != self.pos.config.stock_location_id[0] && item[1] > 0){
                                    prod_info.push(item)
                                    total_qty += item[1]
                                }
                            });
                            if(total_qty > 0){
                                 $("[data-product-id='"+product.id+"']").find('.total_qty').html(product.qty_available)
                                 self.gui.show_popup('product_qty_advance_popup',{prod_info_data:prod_info,total_qty: total_qty,product: product});
                            }
                        }
                        }).fail(function (error, event){
                            if(error.code === -32098) {
                                self.pos.db.notification('danger',_t("Server Down..."));
                                event.preventDefault();
                           }
                        });
                    }else{
                        // options.click_product_action(product);
                        if (product.product_variant_count && product.product_variant_count > 1) {
                            // Normal behaviour, The template has only one variant
                            self.gui.show_screen('select_variant_screen',{product_tmpl_id:product.product_tmpl_id});
                        }
                        else{
                            // Display for selection all the variants of a template
                            options.click_product_action(product);
        //                     self.pos.pos_widget.screen_selector.show_popup('select-variant-popup', product.product_tmpl_id);
                        }
                    }
                }
            };
            this.product_list = options.product_list || [];
            this.product_cache = new screens.DomCache();
            this.pos.get('orders').bind('add remove change', function () {
                self.renderElement();
            }, this);

            this.pos.bind('change:selectedOrder', function () {
                this.renderElement();
            }, this);
        },
//        renderElement: function() {
//			var self = this;
//			var order = self.pos.get_order();
//			var product_list = [];
//			_.each(this.product_list,function(prd){
//				if(order && order.is_sale_product(prd)){
//					product_list.push(prd)
//				}
//			});
//			this.product_list = product_list;
//			this._super();
//		},
        renderElement: function() {
            var self = this;
            this._super();
            var order = self.pos.get_order();
            if(order && order.get_is_categ_sideber_open()){
                $('.product-list-container').css('right','150px');
            }
            var product_list = $('.product-list');
            if(self.pos.chrome.screens && self.pos.chrome.screens.products){
                var list_view = self.pos.chrome.screens.products.product_categories_widget.list_view;
                if(list_view){
                    product_list.addClass('list');
                }else{
                    product_list.removeClass('list');
                }
            }
            
        },
        set_product_list: function(product_list){
            var self = this;
            var new_product_list = [];
            var ignore_product_list = [];
            var order = self.pos.get_order();
            var dummy_product_ids = self.pos.db.get_dummy_product_ids();
            if(product_list.length > 0){
                product_list.map(function(product){
                    if(($.inArray(product.id, dummy_product_ids) == -1) && (!product.is_dummy_product)
                        && (product.is_primary_variant)){
                        new_product_list.push(product);
                    }
                });
            }
            this.product_list = new_product_list;
            this.renderElement();
        },
        render_product: function(product){
            self = this;
            if (product.product_variant_count == 1){
                // Normal Display
                return this._super(product);
            }else{
                var cached = this.product_cache.get_node(product.id);
                if(!cached){
                    var image_url = this.get_product_image_url(product);
                    var product_html = QWeb.render('Product',{
                            widget:  this,
                            product: product,
                            image_url: this.get_product_image_url(product),
                        });
                    var product_node = document.createElement('div');
                    product_node.innerHTML = product_html;
                    product_node = product_node.childNodes[1];
                    this.product_cache.cache_node(product.id,product_node);
                    return product_node;
                }
                return cached;
            }
        },
    });
//  Load Background
    screens.ProductCategoriesWidget.include({
        init: function(parent, options){
            var self = this;
            this._super(parent,options);
            if(self.start_categ_id){
                setTimeout(function(){
                    var categ = self.pos.db.get_category_by_id(self.start_categ_id);
                    if(categ.parent_id.length > 0){
//            			self.pos.chrome.screens.products.render_product_category([categ]);
                        self.chrome.screens.products.set_back_to_parent_categ(categ.parent_id[0]);
                    }else{
                        var sub_categories = self.pos.db.get_category_by_id(self.pos.db.get_category_childs_ids(0));
                        self.pos.chrome.screens.products.render_product_category(sub_categories);
                    }
                    self.chrome.$el.find(".v-category[data-category-id='"+self.start_categ_id+"']").trigger('click');
                }, 2000);
            }
            self.clear_category_search_handler = function(event){
                self.clear_cat_search();
            };
            if(!self.pos.load_background){
                var product_ids_list = [];
                var product_fields = self.pos.product_fields.concat(['name', 'display_name', 'product_variant_ids', 'product_variant_count'])
                $.ajax({
                    type: "POST",
                    url: '/web/dataset/load_cache_with_template',
                    data: {
                        model: 'product.product',
                        config_id: self.pos.pos_session.config_id[0],
                        fields: JSON.stringify(product_fields),
                        domain: JSON.stringify(self.pos.product_domain),
                    },
                    success: function(res) {
                        var cache_products = JSON.parse(res);
                        if(cache_products && cache_products.length > 0){
                            self.pos.product_list = cache_products;
                            self.pos.db.add_products(_.map(cache_products, function (product) {
                                product_ids_list.push(product.product_tmpl_id[0])
                                product.categ = _.findWhere(self.product_categories, {'id': product.categ_id[0]});
                                return new models.Product({}, product);
                            }));
                            if(product_ids_list && product_ids_list.length > 0){
                                product_ids_list = _.uniq(product_ids_list)
                                var total_products = product_ids_list.length;
                                var remaining_time;
                                if(total_products){
                                    var product_limit = 1000;
                                    var count_loop = product_ids_list.length;
                                    var last_ids = product_ids_list;
                                    var count_loaded_products = 0;
                                    var context = _.extend(self.pos.product_context, {
                                        'location': self.pos.config.stock_location_id[0],
                                    })
                                    function ajax_product_template_load(){
                                        if(count_loop > 0){
                                            $.ajax({
                                                type: "POST",
                                                url: '/web/dataset/load_products_template',
                                                data: {
                                                        model: 'product.template',
                                                        fields: JSON.stringify(product_fields),
                                                        context: JSON.stringify(context),
                                                        product_limit:product_limit,
                                                        product_ids:JSON.stringify(last_ids.splice(0, product_limit) || []),
                                                        stock_location_id:JSON.stringify(self.pos.config.stock_location_id[0]),
                                                    },
                                                success: function(res) {
                                                    var all_products = JSON.parse(res);
                                                    count_loop -= product_limit;
                                                    remaining_time = ((total_products - count_loop) / total_products) * 100;
                                                    self.pos.db.add_templates(_.map(all_products, function (product) {
                                                        product.categ = _.findWhere(self.product_categories, {'id': product.categ_id[0]});
                                                        if(product.product_variant_ids && product.product_variant_ids[1]){
                                                            _.each(product.product_variant_ids, function(prod_id){
                                                                var product_pro = self.pos.db.get_product_by_id(prod_id);
                                                                if(product_pro){
                                                                    var prod_obj = self.pos.chrome.screens.products.product_list_widget;
                                                                    var current_pricelist = prod_obj._get_active_pricelist();
                                                                    prod_obj.product_cache.clear_node(product_pro.id+','+current_pricelist.id);
                                                                    prod_obj.render_product(product_pro);
                                                                }
                                                            });
                                                        }
                                                        return new models.Product({}, product);
                                                    }));
                                                    self.pos.gui.screen_instances.products.product_categories_widget.renderElement();
                                                    if(remaining_time > 100)
                                                        remaining_time = 100;
                                                    $('.product_progress_bar').css('display','');
                                                    $('.product_progress_bar').find('#bar').css('width', parseInt(remaining_time)+'%', 'important');
                                                    $('.product_progress_bar').find('#progress_status').html(parseInt(remaining_time) + "% completed");

                                                    count_loaded_products += all_products.length;
                                                    if(count_loaded_products >= total_products){
                                                        $('.product_progress_bar').delay(3000).fadeOut('slow');
                                                    }
                                                    all_products = [];
                                                    ajax_product_template_load();
                                                },
                                            });
                                        }else{
                                            self.pos.load_new_products();
                                        }
                                    }
                                    ajax_product_template_load();
                                }
                            }
                        }
                    },
                    error: function(e) {
                        console.error("Error: ",e);
                    },
                });
                return true;
            }else{
                var data = {
                    'config_id': self.pos.config.id,
                    'product_domain': self.pos.product_domain,
                    'product_fields': self.pos.product_fields,
                    'compute_user_id': self.pos.user.id
                    }
                var records = rpc.query({
                    model: 'product.product',
                    method: 'calculate_product',
                    args: [self.pos.config.id],
                }).fail(function(){
                    self.pos.db.notification('danger',"Connection lost");
                });
                records.then(function(result){
                    $('div.product_progress_bar').css('display','');
                    $('#product_sync').hide();
                    if(result && result[0]){
                        var product_ids = _.uniq(result);
                        var total_products = product_ids.length;
                        var remaining_time;
                        if(total_products){
                            var product_limit = 1000;
                            var count_loop = product_ids.length;
                            var last_ids = product_ids;
                            var count_loaded_products = 0;
                            var context = _.extend(self.pos.product_context, {
                                'location': self.pos.config.stock_location_id[0],
                            })
                            function ajax_product_load(){
                                if(count_loop > 0){
                                    var product_fields = self.pos.product_fields.concat(['name', 'display_name', 'product_variant_ids', 'product_variant_count'])
                                    $.ajax({
                                        type: "POST",
                                        url: '/web/dataset/load_products',
                                        data: {
                                            model: 'product.product',
                                            fields: JSON.stringify(product_fields),
//    						                    domain: JSON.stringify(self.pos.product_domain),
                                            context: JSON.stringify(context),
                                            product_limit:product_limit,
                                            product_ids:JSON.stringify(last_ids.splice(0, product_limit) || []),
                                            stock_location_id:JSON.stringify(self.pos.config.stock_location_id[0]),
                                        },
                                        success: function(res) {
                                            var response = JSON.parse(res);
                                            var all_products = response.product;
                                            self.all_templates = response.templates
                                            count_loop -= all_products.length;
                                            remaining_time = ((total_products - count_loop) / total_products) * 100;
                                            var filter_product_ids = [];
                                            all_products.map(function(product){
                                                self.pos.product_list.push(product);
                                            });
                                            self.pos.db.add_products(_.map(all_products, function (product) {
                                                product.categ = _.findWhere(self.pos.product_categories, {'id': product.categ_id[0]});
                                                return new models.Product({}, product);
                                            }));
                                            self.pos.db.add_templates(_.map(self.all_templates, function (product) {
                                                product.categ = _.findWhere(self.pos.product_categories, {'id': product.categ_id[0]});
                                                return new models.Product({}, product);
                                            }));
                                            self.renderElement();
                                            if(remaining_time > 100)
                                                remaining_time = 100;
                                            $('.product_progress_bar').css('display','');
                                            $('.product_progress_bar').find('#bar').css('width', parseInt(remaining_time)+'%', 'important');
                                            $('.product_progress_bar').find('#progress_status').html(parseInt(remaining_time) + "% completed");
                                            count_loaded_products += all_products.length;
                                            all_products = [];
                                            if(count_loaded_products >= total_products){
                                                self.pos.load_background = true;
                                                $('.product_progress_bar').delay(3000).fadeOut('slow');
                                            }
                                            ajax_product_load();
                                        },
                                        error: function() {
                                            $('.product_progress_bar').find('#bar').css('width', '100%', 'important');
                                            $('.product_progress_bar').find('#progress_status').html("Products loading failed...");
                                        },
                                    });
                                } else {
//    			    				self.pos.gui.screen_instances.products.product_categories_widget.renderElement();
                                    $('#product_sync').show();
                                    self.pos.load_background = true;
                                    var prod = self.pos.db.get_product_by_category(0);
                                    $.ajax({
                                        type: 'POST',
                                        url: '/web/dataset/store_data_to_cache',
                                        data: {
                                            cache_data : JSON.stringify([data]),
                                        },
                                        dataType:'json',
                                        success: function(res) {
                                            self.pos.db.notification('success',_t('Cache data stored!'));
                                        },
                                        error: function(e) {
                                            console.error("Error: ",e);
                                            self.pos.db.notification('danger',_t('Cache data store error!'));
                                        },
                                    });
                                }
                            }
                            ajax_product_load();
                        }
                    }
                });
            }
        },
        render_category: function (category, with_image, is_back, color) {
            if (is_back) {
                var category_html = QWeb.render('CategoryButtonBack', {
                    widget: this,
                    category: category,
                });
                var category_node = document.createElement('div');
                category_node.innerHTML = category_html.trim();
                category_node = category_node.childNodes[0];
                category_node.setAttribute('style', 'background-color: #'+color);
                return category_node;
            }
            return this._super(category, with_image)
        },
        getRangeOfDisplayedCategories: function(listContainer){
            var container = $(listContainer)[0];
            var start = -1;
            var i = 1;
            while (i < container.children.length - 1 && start < 0) {
                var children = $(container.children[i]);
                if (!children.hasClass('d-none') && !children.hasClass('subcategory-button-back') && !children.hasClass('subcategory-button-forward')) {
                    start = i;
                }
                i++;
            }
            if (i < container.children.length - 1){
                var end = 0;
                var children;
                do {
                    children = $(container.children[i]);
                    end = i;
                    i++;
                } while(i < container.children.length - 1 && !children.hasClass('d-none') && !children.hasClass('subcategory-button-back') && !children.hasClass('subcategory-button-forward'));
                return { 'start': start, 'end': end };
            }
            return { 'start': 0, 'end': 17 };
        },
        addListenerSubCategoryBtnBack: function(button, list_container){
            button.addEventListener('click', function (event) {
                var container = $(list_container)[0];
                var start = -1;
                var i = 1;
                while (i < container.children.length - 1 && start < 0) {
                    var children = $(container.children[i]);
                    if (!children.hasClass('d-none') && !children.hasClass('subcategory-button-back') && !children.hasClass('subcategory-button-forward')) {
                        start = i;
                    }
                    i++;
                }
                if (start > 1) {
                    var move = Math.min(4, start - 1);
                    var i = 1;
                    while (i <= move) {
                        $(container.children[start - i]).removeClass('d-none');
                        i++;
                    }
                    if (start + 17 < container.children.length - 1) {
                        i = 0;
                        while (move) {
                            $(container.children[start + 17 - i]).addClass('d-none');
                            i++;
                            move--;
                        }
                    }
                }
            });
            return button;
        },
        addListenerSubCategoryBtnForward: function(button, list_container){
            button.addEventListener('click', function (event) {
                var container = $(list_container)[0];
                var start = -1;
                var i = 1;
                while (i < container.children.length - 1 && start < 0) {
                    var children = $(container.children[i]);
                    if (!children.hasClass('d-none') && !children.hasClass('subcategory-button-back') && !children.hasClass('subcategory-button-forward')) {
                        start = i;
                    }
                    i++;
                }
                if (start > -1 && start + 18 < container.children.length - 1) {
                    var move = Math.min(4, container.children.length - 2 - (start + 17));
                    var i = 0;
                    while (i < move) {
                        $(container.children[start + i]).addClass('d-none');
                        i++;
                    }
                    var i = 1;
                    while (i <= move) {
                        $(container.children[start + 17 + i]).removeClass('d-none');
                        i++;
                    }
                }
            });
            return button;
        },
        renderElement: function () {
            var el_str = QWeb.render(this.template, {widget: this});
            var el_node = document.createElement('div');
            self = this;

            el_node.innerHTML = el_str;
            el_node = el_node.childNodes[1];

            if (this.el && this.el.parentNode) {
                this.el.parentNode.replaceChild(el_node, this.el);
            }

            this.el = el_node;

            var withpics = this.pos.config.iface_display_categ_images;

            var list_container = el_node.querySelector('.category-list');
            if (list_container) {
                if (!withpics) {
                    list_container.classList.add('simple');
                } else {
                    list_container.classList.remove('simple');
                }
                // =====================Add the parent categories===========================
                var parent = this.category.parent_id
                var c = 999999;
                var last_child = this.category;
                var node_category_parent = false;
                var start_range = -1;
                var end_range = -1;
                while(parent){
                    node_category_parent = list_container.cloneNode();
                    var parent_category = this.pos.db.get_category_by_id(parent[0]);
                    if(start_range == -1 && parent_category.child_id.length > 18){
                        var position = -1;
                        var i = 0;
                        while(position == -1 && i < parent_category.child_id.length){
                            if(parent_category.child_id[i] == this.category.id){
                                position = i;
                            }
                            i++;
                        }
                        if(position < 8){
                            start_range = Math.max(0, position - 8);
                            end_range = position + 17 - (position - start_range);
                        }else{
                            end_range = Math.min(parent_category.child_id.length - 1, position + 9);
                            start_range = position - ( 17 - (end_range - position));
                        }
                    }
                    var super_parent = false;
                    if (parent_category.child_id.length > 18){
                        var back_button_html = QWeb.render('SubCategoryButtonBack', {});
                        back_button_html = _.str.trim(back_button_html);
                        var back_button_node = document.createElement('div');
                        back_button_node.innerHTML = back_button_html;
                        back_button_node = back_button_node.childNodes[0];
                        node_category_parent.appendChild(this.addListenerSubCategoryBtnBack(back_button_node, node_category_parent));
                    }
                    for(var i = 0; i < parent_category.child_id.length; i++) {
                        var super_child = parent_category.child_id[i];
                        var child_obj = self.pos.db.get_category_by_id(super_child);
                        var real_color = c+"";
                        if(last_child.id == super_child){
                            real_color = "6ec89b";
                            last_child = parent_category;
                        }
                        var category_node = self.render_category(child_obj, withpics, true, real_color);
                        if ((i < start_range || i > end_range)  && parent_category.child_id.length > 18){
                            $(category_node).addClass('d-none');
                        }else if(parent_category.child_id.length > 18){
                            $(category_node).removeClass('d-none');
                        }
                        node_category_parent.appendChild(category_node);
                        if (!super_parent) {
                            super_parent = parent_category.parent_id;
                        }
                    }
                    if (parent_category.child_id.length > 18){
                        var forward_button_html = QWeb.render('SubCategoryButtonForward', {});
                        forward_button_html = _.str.trim(forward_button_html);
                        var forward_button_node = document.createElement('div');
                        forward_button_node.innerHTML = forward_button_html;
                        forward_button_node = forward_button_node.childNodes[0];
                        node_category_parent.appendChild(this.addListenerSubCategoryBtnForward(forward_button_node, node_category_parent));
                    }
                    list_container.parentElement.prepend(node_category_parent);
                    parent = super_parent;
                    c -= 333333;
                }
                if (this.category.id != 0) {
                    var all_categories = this.pos.db.category_by_id;
                    var list_home = [];
                    _.each(all_categories, function(category_item){
                        if (category_item.parent_id == false) {
                            list_home.push(category_item);
                        }
                    });
                    list_home = list_home.sort(function(a, b){
                        if(a.name > b.name){
                                return 1;
                            }
                            if(a.name < b.name){
                                return -1;
                            }
                        return 0;
                    });
                    var div_list_home = list_container.cloneNode();
                    _.each(list_home, function (item_home) {
                        var real_color = c+"";
                        if(last_child.id == item_home.id){
                            real_color = "6ec89b";
                        }
                        div_list_home.appendChild(self.render_category(item_home, withpics, true, real_color));
                    });
                    list_container.parentElement.prepend(div_list_home);
                }

                // =========Ending the addition of parent categories================================
                if (this.subcategories.length > 18){
                    var range = this.getRangeOfDisplayedCategories(list_container);
                    start_range = range['start'];
                    end_range = range['end'];
                    var back_button_html = QWeb.render('SubCategoryButtonBack', {});
                    back_button_html = _.str.trim(back_button_html);
                    var back_button_node = document.createElement('div');
                    back_button_node.innerHTML = back_button_html;
                    back_button_node = back_button_node.childNodes[0];
                    list_container.appendChild(this.addListenerSubCategoryBtnBack(back_button_node, list_container));
                }

                for (var i = 0, len = this.subcategories.length; i < len; i++) {
                    var category_node = this.render_category(this.subcategories[i], withpics, false);
                    if (i >= start_range && i <= end_range && this.subcategories.length > 18){
                        $(category_node).removeClass('d-none');
                    }else if(this.subcategories.length > 18){
                        $(category_node).addClass('d-none');
                    }
                    list_container.appendChild(category_node);
                }

                if (this.subcategories.length > 18){
                    var forward_button_html = QWeb.render('SubCategoryButtonForward', {});
                    forward_button_html = _.str.trim(forward_button_html);
                    var forward_button_node = document.createElement('div');
                    forward_button_node.innerHTML = forward_button_html;
                    forward_button_node = forward_button_node.childNodes[0];
                    list_container.appendChild(this.addListenerSubCategoryBtnForward(forward_button_node, list_container));
                }
            }
            var buttons = el_node.querySelectorAll('.js-category-switch');
            for(var i = 0; i < buttons.length; i++){
                buttons[i].addEventListener('click',this.switch_category_handler);
            }

            var products = this.pos.db.get_product_by_category(this.category.id);
            this.product_list_widget.set_product_list(products); // FIXME: this should be moved elsewhere ...

            this.el.querySelector('.searchbox input').addEventListener('keypress',this.search_handler);

            this.el.querySelector('.searchbox input').addEventListener('keydown',this.search_handler);

            this.el.querySelector('.search-clear').addEventListener('click',this.clear_search_handler);

            if(this.pos.config.iface_vkeyboard && this.chrome.widget.keyboard){
                this.chrome.widget.keyboard.connect($(this.el.querySelector('.searchbox input')));
            }
            var self = this;
            //Category search
//            $('.category_home').click(function(){
//                alert();
//            });
//            self.el.querySelector('.category_home').addEventListener('click',function(){
//                var cat = self.pos.db.get_category_by_id(self.pos.db.root_category_id);
//                self.set_category(cat);
//			    var sub_categories = self.subcategories;
//			    var products = self.gui.screen_instances.products;
//			    if(products){
//			        products.parent_categ_id = self.pos.db.root_category_id;
//                    products.render_product_category(sub_categories);
//                    products.product_categories_widget.renderElement();
//			    }
//                self.renderElement();
//            });
            $('.category_searchbox input', this.el).keyup(function(e){
                if($(this).val() == ""){
                    var cat = self.pos.db.get_category_by_id(self.pos.db.root_category_id);
                    self.set_category(cat);
                    self.clear_cat_search();
                }
                $('.category_searchbox input').autocomplete({
                     source:self.pos.db.get_category_search_list(),
                     select: function(event, select_category){
                         if(select_category.item && select_category.item.id){
                            var cat = self.pos.db.get_category_by_id(select_category.item.id);
                             self.set_category(cat);
                             self.renderElement();
                             var input = $('.category_searchbox input');
                             input.val(select_category.item.label);
                             input.focus();
                         }
                     },
                });
                e.stopPropagation();
            });
            $('.category_searchbox input', this.el).keypress(function(e){
                $('.category_searchbox input').autocomplete({
                    source:self.pos.db.get_category_search_list(),
                    select: function(event, select_category){
                        if(select_category.item && select_category.item.id){
                            var cat = self.pos.db.get_category_by_id(select_category.item.id);
                            self.set_category(cat);
                            self.renderElement();
                            input.val(select_category.item.label);
                            var input = $('.category_searchbox input');
                            input.focus();
                        }
                    },
                });
                e.stopPropagation();
            });
            this.el.querySelector('.category-clear').addEventListener('click',this.clear_category_search_handler);
            this.el.querySelector('.listview').addEventListener('click',function(){
                var product_list = $(self.pos.chrome.screens.products.product_list_widget.el).find('.product-list');
                if(self.list_view){
                    self.list_view = false;
                    product_list.removeClass('list');
                    $(this).css({
                        'background':'#fff',
                        'color':'#000',
                    });
                }else{
                    self.list_view = true;
                    product_list.addClass('list');
                    $(this).css({
                        'background':'#f55d64',
                        'color':'#fff',
                    });
                }
            });
        },
        clear_cat_search: function(){
            var self = this;
            this.set_category(this.pos.db.get_category_by_id(this.start_categ_id));
            self.renderElement();
            var input = $('.category_searchbox input');
            input.val('');
            input.focus();
        },
    });

    var LoginScreenWidget = screens.ScreenWidget.extend({
        template: 'LoginScreenWidget',
        init: function(parent, options){
            var self = this;
            this._super(parent, options);
        },
        start: function(){
            var self = this;
            this._super();
            $("input#username").focus();
            var selected_input;
            if ($("#login").is(":focus")) {
                selected_input = $("#login");
            }
            if ($("#password").is(":focus")) {
                selected_input = $("#password");
            }
            $("input").focus(function() {
                selected_input = $(this);
            });
            $('.number_pad_button').click(function() {
                var pres_char = $(this).html();
                if ($(this).hasClass("ac-clear-data")) {
                    selected_input.val("");
                } else if ($(this).hasClass("back-button")) {
                    selected_input.val(selected_input.val().slice(0, -1));
                } else if ($(this).hasClass("ac-submit-button")) {

                } else if ($(this).hasClass("login_space")) {
                    if(selected_input){
                        selected_input.val(selected_input.val() + " ");
                    }
                } else {
                    if(selected_input){
                        selected_input.val(selected_input.val() + "" + pres_char);
                    }
                }
            });
            $(".change_char").click(function() {
                $(".is_numpad").addClass("display_none");
                $(".is_charpad").removeClass("display_none");
                $(".is_smallcharpad").addClass("display_none")
                $(".change_num").removeClass("display_none");
                $(".change_char").addClass("display_none");
                $(".change_smallChar").removeClass("display_none");
            });
            $(".change_num").click(function() {
                $(".is_numpad").removeClass("display_none");
                $(".is_charpad").addClass("display_none");
                $(".is_smallcharpad").addClass("display_none")
                $(".change_num").addClass("display_none")
                $(".change_smallChar").addClass("display_none");
                $(".change_char").removeClass("display_none");
            });
            $(".change_smallChar").click(function() {
                if ($(".is_smallcharpad").hasClass("display_none")) {
                    $(".is_numpad").addClass("display_none");
                    $(".is_charpad").addClass("display_none");
                    $(".is_smallcharpad").removeClass("display_none");
                    $(".change_smallChar").removeClass("display_none");
                } else {
                    $(".is_charpad").removeClass("display_none");
                    $(".is_smallcharpad").addClass("display_none");
                }
            });
            $('input#password, input#username').keypress(function(e){
                if(e.keyCode == 13){
                    var username = $("input#username").val();
                    var password = $("input#password").val();
                    if(username && password){
                        self.login_user(username, password);
                    }else{
                        self.pos.db.notification('danger',_t('Please enter username and password'));
                    }
                }
            });
            $('#login').click(function(){
                var username = $("input#username").val();
                var password = $("input#password").val();
                if(username && password){
                    self.login_user(username, password);
                }else{
                    self.pos.db.notification('danger',_t('Please enter username and password'));
                }
            });
            $('.pos-login-rightheader').click(function(){
                var user = self.pos.user;
                if(user && user.user_role == 'cook'){
                    framework.redirect('/web/session/logout');
                }else{
                    self.pos.gui.close();
                }
            });
        },
        login_user: function(username, password){
            var self = this;
            var user = _.find(self.pos.users, function(obj) { return obj.login == username && obj.pos_security_pin == password });
            var view_initial = 'products';
            if(user){
                $('.pos-topheader').show();
                self.pos.set_cashier(user);
                self.pos.chrome.screens.products.actionpad.renderElement();
                $('.pos-login-topheader').hide();
                self.chrome.widget.username.renderElement();
                if(self.pos.pos_session.opening_balance){
                    return self.gui.show_screen('openingbalancescreen');
                }
                if(self.pos.config.module_pos_restaurant){
                    if (self.pos.config.iface_floorplan) {
                        self.gui.set_startup_screen('floors');
                        self.gui.show_screen("floors");
                        view_initial = 'floors';
                    } else {
                        self.gui.show_screen("products");
                        view_initial = 'products';
                    }
                }else{
                    self.gui.show_screen("products");
                    view_initial = 'products';
                }
                self.pos.chrome.slider_widget.renderElement();
                self.pos.set_login_from('login');
                if(self.pos.get_locked_screen()){
                    self.gui.show_screen(self.pos.get_locked_screen());
                    if(self.pos.get_locked_screen() !== 'floors'){
                        setTimeout(function(){
                            $('#slidemenubtn').show();
                        }, 10);
                    }
                }else{
                    self.gui.set_default_screen('products');
                }
                self.pos.set_locked_screen(false);
                self.pos.set_locked_user(false);
                if($('.show-left-cart').css('display') == 'block'){
                    $('.show-left-cart').hide();
                }
                self.pos.chrome.screens.products.order_widget.update_summary();
                var params = {
                    model: 'pos.session',
                    method: 'write',
                    args: [self.pos.pos_session.id,{'is_lock_screen' : false}],
                }
                rpc.query(params, {async: false}).then(function(result){
                    if(result){
                         $('.lock_button').css('background-color', '#eee');
                    }
                }).fail(function(){
                    self.pos.db.notification('danger',"Connection lost");
                });
                if(self.pos.config.enable_automatic_lock && self.pos.get_cashier().access_pos_lock){
                    start_lock_timer(self.pos.config.time_interval, self);
                }
                //   print initial amount ticket
                if (self.pos.config.iface_print_auto) {
                    self.gui.show_screen('initialBalanceTicket');
                    setTimeout(function () {
                        self.gui.show_screen(view_initial);
                    }, 1000);
                }
                else {
                    self.gui.show_screen(view_initial);
                }

            }else{
                self.pos.db.notification('danger',_t('Invalid Username or Pin!!!'));
            }
        },
        get_company_image_url: function(){
            var company_id = this.pos.company.id;
            if(company_id){
                return window.location.origin + '/web/binary/company_logo?&company=' + company_id;
            }
        },
        get_pos_config_image_str: function() {
            if (this.pos) {
                return window.location.origin + "/web/image/pos.config/" + this.pos.config.id + "/imagen/"
            }
        },
        show: function(){
            var self = this;
            this._super();
            $('#slidemenubtn').hide();
            $("input#password").val('');
            $('.pos-topheader').hide();
            $("input#username").focus();
            $('.pos-login-topheader').show();
            if(self.pos.get_locked_user()){
                $("input#username").val(self.pos.get_locked_user());
                $("input#password").focus();
            }else{
                $("input#username").val('');
            }
        },
        close: function(){
            var self = this;
            this._super();
        },
    });
    gui.define_screen({name:'login', widget: LoginScreenWidget});

    var OpeningBalanceScreenWidget = screens.ScreenWidget.extend({
        template: 'OpeningBalanceScreenWidget',
        init: function(parent, options){
            var self = this;
            this._super(parent, options);
        },
        show: function() {
            this._super();
            var self = this;
            this.renderElement();
            $('#skip').click(function(){
                if(self.pos.config.module_pos_restaurant){
                    if (self.pos.config.iface_floorplan) {
                        self.gui.show_screen("floors");
                    }
                }else{
                    self.gui.show_screen('products');
                }
                var params = {
                                model: 'pos.session',
                                method: 'close_open_balance',
                                args:[self.pos.pos_session.id]
                              }
                rpc.query(params, {async: false})
            });
            $('#value, #no_of_values').keypress(function(e){
               if (e.which != 8 && e.which != 46 && e.which != 0 && (e.which < 48 || e.which > 57)) {
                   return false;
               }
            });
        },
        renderElement:function(){
            this._super();
            var self = this;
            self.open_form();
        },
        open_form: function() {
            var self = this;
            var open_table_row = "<tr id='open_balance_row'>" +
                            "<td><input type='text'  class='openbalance_td' id='value' value='0.00' /></td>" +
                            "<td><input type='text' class='openbalance_td' id='no_of_values' value='0.00' /></td>" +
                            "<td><input type='text' class='openbalance_td' id='subtotal' disabled='true' value='0.00' /></td>" +
                            "<td id='delete_row'><span class='fa fa-trash-o' style='font-size: 20px;'></span></td>" +
                            "</tr>";
            $('#opening_cash_table tbody').append(open_table_row);
            $('#add_open_balance').click(function(){
                $('#opening_cash_table tbody').append(open_table_row);
            });
            $('#opening_cash_table tbody').on('click', 'tr#open_balance_row td#delete_row',function(){
                $(this).parent().remove();
                self.compute_subtotal();
            });
            $('#opening_cash_table tbody').on('change focusout', 'tr#open_balance_row td',function(){
                var no_of_value, value;
                if($(this).children().attr('id') === "value"){
                    value = Number($(this).find('#value').val());
                    no_of_value = Number($(this).parent().find('td #no_of_values').val());
                }else if($(this).children().attr('id') === "no_of_values"){
                    no_of_value = Number($(this).find('#no_of_values').val());
                    value = Number($(this).parent().find('td #value').val());
                }
                $(this).parent().find('td #subtotal').val(value * no_of_value);
                self.compute_subtotal();
            });
            this.compute_subtotal = function(event){
                var subtotal = 0;
                _.each($('#open_balance_row td #subtotal'), function(input){
                    if(Number(input.value) && Number(input.value) > 0){
                        subtotal += Number(input.value);
                    }
                });
                $('.open_subtotal').text(self.format_currency(subtotal));
            }
            $('#validate_open_balance').click(function(){
                var items = []
                var open_balance = []
                var total_open_balance = 0.00;
                $(".openbalance_td").each(function(){
                    items.push($(this).val());
                });
                while (items.length > 0) {
                  open_balance.push(items.splice(0,3))
                }
                _.each(open_balance, function(balance){
                    total_open_balance += Number(balance[2])
                });
                if(total_open_balance > 0){
                    var params = {
                        model: 'pos.session',
                        method: 'open_balance',
                        args:[self.pos.pos_session.id,total_open_balance]
                    }
                    rpc.query(params, {async: false}).then(function(res){
                        if(res){
                            if(self.pos.config.module_pos_restaurant){
                                if (self.pos.config.iface_floorplan) {
                                    self.gui.set_startup_screen('floors');
                                    self.gui.show_screen("floors");
                                } else {
                                    self.gui.show_screen("products");
                                }
                            }else{
                                self.gui.show_screen("products");
                            }
                        }
                    }).fail(function (type, error){
                        if(error.code === 200 ){    // Business Logic Error, not a connection problem
                           self.gui.show_popup('error-traceback',{
                                'title': error.data.message,
                                'body':  error.data.debug
                           });
                        }
                    });
                } else{
                    return;
                }
            });
        },
    });
    gui.define_screen({name:'openingbalancescreen', widget: OpeningBalanceScreenWidget});

    screens.ClientListScreenWidget.include({
        init: function(parent, options){
            var self = this;
            this._super(parent, options);
        },
        willStart: function() {
            var self = this;
            var def1 = this._super.apply(this, arguments);

            var def2 =  rpc.query({
                    model: 'res.partner',
                    method: 'calculate_partner',
                    args: [JSON.stringify(self.pos.partner_fields)],
                }).then(function(result){
                    if(result && result[0]) {
                        var partner_ids = result;
                        var total_partners = partner_ids.length;
                        if(total_partners) {
                            self.pos.partners = result;
                            self.pos.partners_load = true;
                            self.pos.db.add_partners(result);
                        }
                    }
                }).fail(function(){
                    self.pos.db.notification('danger', _t("Connection lost"));
                });

            return $.when(def1, def2);
        },
        show: function(){
            var self = this;
            self._super();
            this.selected_partner = false;
            var partner = self.pos.partners;
            var order = self.pos.get_order();
            var options = order.get_screen_data('params');
            self.render_list(self.pos.db.get_partners_sorted(5000));
            this.change_pin = false;
            if (options && options.change_pin){
                this.change_pin = true;
                this.$('.next').html('Cambiar PIN');
                //this.$('.next').after($('button.do_change_pin.button.highlight'));
            }else{
                this.change_pin = false;
            }
            //order.set_screen_data('params', {});
            if(order.get_client()){
                self.display_client_details('show',order.get_client(),0);
            } else{
                if(partner && partner[0]){
                    self.display_client_details('show',partner[0],0);
                }
            }
            this.$('.back').unbind('click').click(function(){
                self.pos.gui.show_screen('products');
            });
            this.$('.credit').click(function(){
                self.pos.get('customer_credit_list');
                var selected_line = Number($('.client-line.highlight').attr('data-id')) || self.new_client.id || self.old_client.id;
                self.gui.show_screen('customercreditlistscreen', {cust_id: selected_line});
                var records = self.pos.get('customer_credit_list');
                self.render_list(records)
            });
            this.$('.add-money-button').click(function() {
                self.save_changes();
                var selected_line = Number($('.client-line.highlight').attr('data-id')) || self.new_client.id || self.old_client.id;
                if(selected_line){
                    var customer = self.pos.db.get_partner_by_id(selected_line)
                    if(customer){
                        self.gui.show_popup('AddMoneyToCreditPopup', {new_client: customer});
                    }
                }
            });
            this.$('.print-ledger').click(function(){
                var pos_session_id = self.pos.pos_session.id;
                var order = self.pos.get_order();
                order.set_ledger_click(true);
                self.gui.show_popup('cash_inout_statement_popup');
            });
            var $show_customers = $('#show_customers');
            var $show_client_history = $('#show_client_history');
            if (this.pos.get_order().get_client() || this.new_client) {
                $show_client_history.removeClass('oe_hidden');
            }
            $show_customers.off().on('click', function(e){
                $('.client-list').removeClass('oe_hidden');
                $('#customer_history').addClass('oe_hidden')
                $show_customers.addClass('oe_hidden');
                $show_client_history.removeClass('oe_hidden');
            })
            $('#globe_cust').click(function() {
                if(self.selected_partner){
                    self.pos.gui.show_popup('map_popup',{'partner':self.selected_partner})
                }
            });
            this.$('.searchbox > input').focus();
            this.$('.default').click(function(){
                self.default_customer();
                self.gui.back();
            });
            this.$('.next').click(function(e){
                var options = order.get_screen_data('params');
                if (options){
                    var valid_credit = options.valid_credit;
                    var valid_debit = options.valid_debit;
                    var valid_meal_plan = options.valid_meal_plan;
                    var client = order.get_client();
                    var payment = options.payment;
                    if (self.change_pin){
                        self.pos.gui.show_popup('update_pip_popup');
                        return;
                    }

                    if (client){
                        var credit_amount = client.remaining_credit_limit;
                        var amount = order.getNetTotalTaxIncluded();
                        if (amount > credit_amount && credit_amount > 0){
                            var cashregister = false;
                            for(var i in self.pos.cashregisters){
                                var reg = self.pos.cashregisters[i];
                                if(reg.journal_id[1] === "POS-Crédito (MXN)"){
                                    cashregister = reg;
                                }
                            }
                            if (cashregister){
                                //var order = self.pos.get_order();
                                order.add_paymentline(cashregister);
                                order.selected_paymentline.set_amount(credit_amount,0 );
                                payment.reset_input();
                                payment.render_paymentlines();
                                payment.order_changes();

                                /*
                                var journal_id = cashregister.journal_id[0];
                                var pos_session_id = cashregister.pos_session_id[0];

                                var cashier_id = self.pos.get_cashier().id;

                                var params = {
                                    model: 'account.payment',
                                    method: "payment_credit",
                                    args: [journal_id, credit_amount, pos_session_id, client.id, cashier_id, true,order.name],
                                }
                                return rpc.query(params).then(function(res){

                                });
                                 */
                                //payment.do_order(order, 'credit');
                            }
                        }else if(amount <= credit_amount){
                            if (valid_credit){
                                if(!self.order_is_valid()){
                                    return;
                                }
                                self.gui.show_popup('show_pop_pin', {cashier: client, payment: payment, type: 'credit'});
                                return;
                            }
                        }else{
                            return self.pos.db.notification('danger', 'Crédito insuficiente');
                        }
                    }

                    /*
                    if (valid_debit){
                        if (client && amount && amount > client.remaining_debit_amount){
                            self.gui.show_popup('max_limit',{
                                remaining_debit_limit: client.remaining_debit_amount,
                                draft_order: true,
                            });
                            order.set_client(false);
                            return
                        }else{
                            self.gui.show_popup('show_pop_pin', {cashier: client, payment: payment, type: 'debit'});
                            return 
                        }                        
                    }else if (valid_credit){
                        
                        if (client && amount > client.remaining_credit_limit){
                            self.gui.show_popup('max_limit',{
                                remaining_debit_limit: client.remaining_credit_limit,
                                draft_order: true,
                            });
                            order.set_client(false);
                            return
                        }else{
                            self.gui.show_popup('show_pop_pin', {cashier: client, payment: payment, type: 'credit'});
                            return
                        }
                    }else if(valid_meal_plan){
                        
                        if (client && amount > client.remaining_meal_plan_limit){
                            self.gui.show_popup('max_limit',{
                                remaining_debit_limit: client.remaining_meal_plan_limit,
                                draft_order: true,
                            });
                            order.set_client(false);
                            return
                        }else{
                            self.gui.show_popup('show_pop_pin', {cashier: client, payment: payment, type: 'mealplan'});
                            return;
                        }
                    }
                     */
                    var skip_payd = options.skip_pay_debit;

                    if (skip_payd){
                        self.gui.show_popup('pay_debit_popup');
                        return;
                    }
                }
            });
            this.$('.client-line').click(function(e){
                console.log(e);
            }) //.attr('-id')
        },
        order_is_valid: function(force_validation) {
            var self = this;
            var order = this.pos.get_order();
            // Validación para el método de pago por tarjeta bancaria
            var amount_card_payment = 0;
            var order_lines = order.get_paymentlines();
            var amount = order.getNetTotalTaxIncluded();
            _.map(order_lines, function(lines){
                    if(lines.name == "Tarjeta Bancaria (MXN)"){
                        amount_card_payment += lines.amount;
                    }
                });
            if(amount_card_payment > amount){
                self.pos.db.notification('danger', 'El total de pagos por tarjeta bancaria no puede ser mayor al monto de la orden');
                return false;
            }
            // --------------------------------------------------------

            var client = order.get_client();
            if (client){
                var params = {
                    model: 'contract.contract',
                    method: 'is_valid_order_date',
                    args:[client.id]
                }
                var valid = false;
                rpc.query(params,{async:false}).then(function(result){
                    valid = result.result
                });
                if(!valid){
                    self.pos.db.notification('danger', 'No tiene contrato vigente');
                    return false;
                }
                var params = {
                    model: 'res.partner',
                    method: 'search_read',
                    domain: [['id', '=', client.id]],
                    fields:['remaining_credit_limit','contract_ids','parent_id']
                };
                rpc.query(params,{async:false}).then(function(result){
                    if (client.remaining_credit_limit != result[0].remaining_credit_limit){
                        client.remaining_credit_limit = result[0].remaining_credit_limit;
                    }
                });
                var credit_limit = client.remaining_credit_limit;
                var credit_lines_amount = 0;
                var order_lines = order.get_paymentlines();
                _.map(order_lines, function(lines){
                    if(lines.name == "POS-Crédito (MXN)"){
                        credit_lines_amount += lines.amount;
                    }
                });
                if (credit_limit < credit_lines_amount){
                    self.pos.db.notification('danger', 'Crédito insuficiente para liquidar la orden');
                    return false;
                }
                return true;
            }
        },
        default_customer: function(){
            var order = this.pos.get_order();
            var self = this;
            if( this.has_client_changed() ){
                if (this.new_client) {
                    order.set_client(this.new_client);
                    var param_config = {
                        model: 'pos.config',
                        method: 'write',
                        args: [self.pos.config.id,{'default_partner_id':this.new_client.id}],
                    }
                    rpc.query(param_config, {async: false}).then(function(result){
                        if(result){
                            self.pos.config.default_partner_id = [self.new_client.id, self.new_client.name];
                        }
                    }).fail(function(type,error){
                            if(error.data.message){
                                self.pos.db.notification('error',error.data.message);
                            }
                    });
                }
            }
        },
        toggle_save_button: function(){
            var self = this;
            this._super();
            var $show_customers = this.$('#show_customers');
            var $show_client_history = this.$('#show_client_history');
            var $customer_history = this.$('#customer_history');
            var client = this.new_client || this.pos.get_order().get_client();
            if (this.editing_client) {
                $show_customers.addClass('oe_hidden');
                $show_client_history.addClass('oe_hidden');
            } else {
                if(client){
                    $show_client_history.removeClass('oe_hidden');
                    $show_client_history.off().on('click', function(e){
                        self.render_client_history(client);
                        $('.client-list').addClass('oe_hidden');
                        $customer_history.removeClass('oe_hidden');
                        $show_client_history.addClass('oe_hidden');
                        $show_customers.removeClass('oe_hidden');
                    });
                } else {
                    $show_client_history.addClass('oe_hidden');
                    $show_client_history.off();
                }
            }
            var $credit_button = this.$('.button.credit');
            if (this.editing_client) {
                $credit_button.addClass('oe_hidden');
                return;
            } else if( this.new_client ){
                if( !this.old_client){
                    $credit_button.text(_t('Credit History'));
                }else{
                    $credit_button.text(_t('Credit History'));
                }
            }else{
                $credit_button.text(_t('Credit History'));
            }
            $credit_button.toggleClass('oe_hidden',!this.has_client_changed());


            var $add_money_button = this.$('.button.add-money-button');
            if (this.editing_client) {
                $add_money_button.addClass('oe_hidden');
                return;
            } else if( this.new_client ){
                if( !this.old_client){
                    $add_money_button.text(_t('Add Credit'));
                }else{
                    $add_money_button.text(_t('Add Credit'));
                }
            }else{
                $add_money_button.text(_t('Add Credit'));
            }
            $add_money_button.toggleClass('oe_hidden',!this.has_client_changed());
        },
        line_select: function(event,$line,id){
            var self = this;
            var params = {
                model: 'res.partner',
                method: 'search_read',
                domain: [['id', '=', id]],
                fields:['remaining_credit_limit']
            };
            rpc.query(params).then(function(result){
                var partner = self.pos.db.get_partner_by_id(id);
                if (partner.remaining_credit_limit != result[0].remaining_credit_limit)
                {
                    partner.remaining_credit_limit = result[0].remaining_credit_limit;
                }
                self.$('.client-list .lowlight').removeClass('lowlight');
                    if ( $line.hasClass('highlight') ){
                        $line.removeClass('highlight');
                        $line.addClass('lowlight');
                        self.display_client_details('hide',partner);
                        self.new_client = null;
                        self.toggle_save_button();
                    }else{
                        self.$('.client-list .highlight').removeClass('highlight');
                        $line.addClass('highlight');
                        var y = event.pageY - $line.parent().offset().top;
                        self.display_client_details('show',partner,y);
                        self.new_client = partner;
                        self.toggle_save_button();
                    }
                });
        },
        _get_customer_history: function(partner){
            var params = {
                model: 'pos.order',
                method: 'search_read',
                domain: [['partner_id', '=', partner.id]],
            };
            rpc.query(params, {async: false})
//            new Model('pos.order').call('search_read', [[['partner_id', '=', partner.id]]], {}, {async: false})
            .then(function(orders){
                if(orders){
                     var filtered_orders = orders.filter(function(o){return (o.amount_total - o.amount_paid) > 0});
                     partner['history'] = filtered_orders;
                }
            });
        },
        render_client_history: function(partner){
            var self = this;
            var contents = this.$el[0].querySelector('#client_history_contents');
            contents.innerHTML = "";
            self._get_customer_history(partner);
            if(partner.history){
                for (var i=0; i < partner.history.length; i++){
                    var history = partner.history[i];
                    var history_line_html = QWeb.render('ClientHistoryLine', {
                        partner: partner,
                        order: history,
                        widget: self,
                    });
                    var history_line = document.createElement('tbody');
                    history_line.innerHTML = history_line_html;
                    history_line = history_line.childNodes[1];
                    history_line.addEventListener('click', function(e){
                        var order_id = $(this).data('id');
                        if(order_id){
                            var previous = self.pos.get_order().get_screen_data('previous-screen');
                            self.gui.show_screen('orderdetail', {
                                order_id: order_id,
                                previous: previous,
                                partner_id: partner.id
                            });
                        }
                    });
                    contents.appendChild(history_line);
                }
            }
        },
        saved_client_details: function(partner_id){
            var self = this;
            var params = {
                model: 'res.partner',
                method: 'search_read',
                domain: [['id', '=', partner_id]],
            };
            rpc.query(params, {async: false}).then(function(partner){
                self.render_list(self.pos.db.get_partners_sorted(1000));
                // update the currently assigned client if it has been changed in db.
                var curr_client = self.pos.get_order().get_client();
                if (curr_client) {
                    self.pos.get_order().set_client(self.pos.db.get_partner_by_id(curr_client.id));
                }
                if (partner) {
                    self.new_client = partner[0];
                    self.pos.db.add_partners(partner);
                    self.toggle_save_button();
                    self.display_client_details('show',partner[0]);
                } else {
                    // should never happen, because create_from_ui must return the id of the partner it
                    // has created, and reload_partner() must have loaded the newly created partner.
                    self.display_client_details('hide');
                }
            });
        },
        render_payment_history: function(){
            var self = this;
            var $client_details_box = $('.client-details-box');
            $client_details_box.addClass('oe_hidden');
        },
        display_client_details: function(visibility,partner,clickpos){
            var self = this;
            if(visibility == 'hide'){
                return;
            }
            self._super(visibility,partner,clickpos);
            self.selected_partner = partner;
            $("#map_search").val('');
            if(navigator.onLine){
                initMap();
                if(partner){
                    codeAddress(partner.address);
                }
            } else{
                self.pos.db.notification('danger','Check Internet Connection!');
            }
            $('#map_search_clear_box').click(function() {
                $('#map_search').val('');
                if(navigator.onLine){
                    codeAddress(partner.address);
                }
            });
            $("#map_search").focus(function() {
                if(navigator.onLine){
                    geolocate();
                }
            });
            if(visibility == "edit"){
                var system_parameters = self.pos.system_parameters;
                if(system_parameters && system_parameters[0]){
                    system_parameters.map(function(system_parameter){
                        if(system_parameter.key == 'google_api_key' && system_parameter.value){
                            $("input.detail.client-name").focus(function() {
                                if(navigator.onLine){
                                    geolocate();
                                }
                            });
                            $("input.detail.client-address-street").focus(function() {
                                if(navigator.onLine){
                                    geolocate();
                                }
                            });
                            $("input.detail.client-address-city").focus(function() {
                                if(navigator.onLine){
                                    geolocate();
                                }
                            });
                            $("input.detail.client-address-zip").focus(function() {
                                if(navigator.onLine){
                                    geolocate();
                                }
                            });
                        }
                    });
                }
            }
        },
        save_changes: function(){
            this._super();
             if (this.pos.config.enable_ereceipt && this.pos.get_cashier().access_ereceipt && this.has_client_changed()) {
                var prefer_ereceipt = this.new_client ? this.new_client.prefer_ereceipt : false;
                var customer_email = this.new_client ? this.new_client.email : false;
                if (prefer_ereceipt) {
                    $('#is_ereciept')[0].checked = true;
                    $('#email_id').show();
                    $('#update_email_tr').show();
                    if(customer_email) {
                        $('#email_id').val(customer_email);
                    }
                } else {
                    $('#is_ereciept')[0].checked = false;
                    $('#email_id').hide();
                    $('#update_email_tr').hide();
                    $('#email_id').val('');
                }
            }
        },
    });

    var ProductsScreenWidget = screens.ScreenWidget.extend({
        template: 'ProductsScreenWidget',
        init: function(parent, options){
            var self = this;
            this._super(parent, options);
            this.category = 0;
            self.product_click = function(){
                var prodict_id = $(this).data('product-id');
                if(prodict_id){
                    var product = self.pos.db.get_product_by_id(prodict_id);
                    if(product){
                        self.gui.show_popup('show_product_popup',{'product':product});
                    }
                }
            };
            this.clear_search_handler = function(event){
                self.clear_search();
                var input = $('.searchbox input');
                input.val('');
                input.focus();
            };
            var search_timeout  = null;
            self.namelist = [];
            _.each(self.pos.db.get_product_namelist(),function(list){
                if(list[0] !== self.pos.config.delivery_product_id[0]){
                    self.namelist.push(list[1]);
                }
            });
            this.search_handler = function(event){
                $(this).autocomplete({
                    source:self.namelist,
                });

                var searchbox = this;
                if(event.type == "keypress" || event.keyCode === 46 || event.keyCode === 8){
                    clearTimeout(search_timeout);
                    search_timeout = setTimeout(function(){
                        self.perform_search(self.category, searchbox.value, event.which === 13);
                    },70);
                }
            };
        },
        events: {
            'click .button.back':'click_back',
            'click .button.btn_kanban':'click_kanban',
            'click .button.btn_list':'click_list',
            'click .button.btn_add_product': 'create_product',
        },
        filter:"all",
        date: "all",
        click_back: function(){
            this.gui.show_screen('products');
        },
        start: function(){
            var self = this;
            self._super();
            this.$('.ac_product_list_manage').delegate('.main-product','click',self.product_click);
        },
        render_products: function(products){
            var new_product_list = [];
            var dummy_product_ids = this.pos.db.get_dummy_product_ids();
            if(products.length > 0){
                products.map(function(product){
                    if(($.inArray(product.id, dummy_product_ids) == -1) && (!product.is_dummy_product)){
                        new_product_list.push(product);
                    }
                });
            }
            $('.product_list_manage').html(QWeb.render('ProductList',{
                widget: this,
                products: new_product_list}));
        },
        show: function(){
            var self = this;
            this._super();
            var all_products = this.pos.db.get_product_by_category(0)
            $('.category_searchbox input').val('');
            $('.searchbox input').val('');
            $('.searchbox input').focus();
            $('span.category-clear_manage').click(function(e){
                self.clear_search();
                var input = $('.category_searchbox input');
                input.val('');
                input.focus();

            });
            this.render_products(all_products);
        },
        renderElement: function(){
            var self = this;
            self._super();
            this.el.querySelector('.searchbox input').addEventListener('keypress',this.search_handler);
            this.el.querySelector('.searchbox input').addEventListener('keydown',this.search_handler);
            this.el.querySelector('.search-clear').addEventListener('click',this.clear_search_handler);
            if(this.pos.config.iface_vkeyboard && this.chrome.widget.keyboard){
                this.chrome.widget.keyboard.connect($(this.el.querySelector('.searchbox input')));
            }
            $('.category_searchbox input', this.el).keyup(function(e){
                if($(this).val() == ""){
                    var cat = self.pos.db.get_product_by_category(self.pos.db.root_category_id);
                    self.render_products(cat);
                }
                 $('.category_searchbox input').autocomplete({
                     source:self.pos.db.get_category_search_list(),
                     select: function(event, select_category){
                         if(select_category.item && select_category.item.id){
                            var cat = self.pos.db.get_product_by_category(select_category.item.id);
                             self.render_products(cat);
                             var input = $('.category_searchbox input');
                             input.val(select_category.item.label);
                             input.focus();
                         }
                     },
                 });
                e.stopPropagation();
            });
            $('.category_searchbox input', this.el).keypress(function(e){
                $('.category_searchbox input').autocomplete({
                    source:self.pos.db.get_category_search_list(),
                    select: function(event, select_category){
                        if(select_category.item && select_category.item.id){
                            var cat = self.pos.db.get_product_by_category(select_category.item.id);
                            self.render_products(cat);
                            var input = $('.category_searchbox input');
                            input.val(select_category.item.label);
                            input.focus();
                        }
                    },
                });
                e.stopPropagation();
            });
        },
     // empties the content of the search box
        clear_search: function(){
            var products = this.pos.db.get_product_by_category(0);
            this.render_products(products);
        },
        perform_search: function(category, query, buy_result){
            var products = this.pos.db.get_product_by_category(category);
            if(query){
                products = this.pos.db.search_product(query);
            }
            this.render_products(products);
        },
        click_kanban: function(event){
            $(event.currentTarget).addClass('highlight');
            $('.btn_list').removeClass('highlight');
            $('.ac_product_list_manage').removeClass('list');
        },
        click_list: function(event){
            $('.ac_product_list_manage').addClass('list');
            $(event.currentTarget).addClass('highlight');
            $('.btn_kanban').removeClass('highlight');
        },
        create_product: function(){
            var self = this;
            self.gui.show_popup('create_product_popup');
        },
    });
    gui.define_screen({name:'product-screen', widget: ProductsScreenWidget});

    screens.PaymentScreenWidget.include({
        events: _.extend({}, screens.PaymentScreenWidget.prototype.events, {
            'click .js_gift_voucher': 'click_gift_voucher',
            'click .open_order_note_popup':'open_order_note_popup',
            'click .button.rounding.rounding_btn':'click_rounding',
            'click .credit_assign':'credit_assign',
            'click #pos-debit': 'pos_debit',
            'click #pos-credit': 'pos_credit',
            'click #pos-meal-plan': 'pos_meal_plan',
            'click .unpaid_draft_order':'unpaid_draft_order',
        }),
        click_tip: function(){
            var self   = this;
            var order  = this.pos.get_order();
            var tip    = order.get_tip();
            var change = order.get_change();
            var value  = tip;
            var total = order.getNetTotalTaxIncluded();

            if (tip === 0 && change > 0  ) {
                value = change;
            }

            this.gui.show_popup('number',{
                'title': tip ? _t('Change Tip') : _t('Add Tip'),
                'value': self.format_currency_no_symbol(value),
                'total': self.format_currency_no_symbol(total),
                'confirm': function(value) {
                    order.set_tip(field_utils.parse.float(value));
                    self.render_paymentlines();
                }
            });
        },
        unpaid_draft_order: function(){
            var self = this;
            var order = self.pos.get_order();
            if(self.pos.config.enable_delivery_charges){
                var time = order.get_delivery_time();
                if(!time){
                    time = $("#txt_del_time").val();
                    if(time){
                        order.set_delivery_time(time);
                    }
                }
                var address = order.get_delivery_address();
                if(!address){
                    address = $('#txt_del_add').val();
                    if(address){
                        order.set_delivery_address(address);
                    }
                }
                var date = order.get_delivery_date();
                var is_deliver = order.get_is_delivery();
                if(is_deliver && !order.get_client()){
                    return self.pos.db.notification('danger',_t('Customer is required to validate delivery order!'));
                }
                if(is_deliver && (!date || !time || !address)){
                    return self.pos.db.notification('danger',_t('Delivery information required to validate order!'));
                }
                var delivery_user_id = $('.delivery_user').val();
                if(order.get_delivery_user_id()){
                    delivery_user_id = order.get_delivery_user_id();
                }
                if(is_deliver && delivery_user_id == 0){
                    return self.pos.db.notification('danger',_t('Please select delivery user to validate order!'));
                }else{
                    order.set_delivery_user_id(delivery_user_id);
                }
                if(is_deliver && date && time && address){
                    order.set_delivery_type('pending');
                }
                var paymentlines = order.get_paymentlines();
                if(paymentlines && paymentlines.length > 0){
                    return self.pos.gui.show_popup('flexi_alert',{
                        'title':_t('Warning'),
                        'body':_t("You can't create draft order with payment."),
                    });
                }
            }else{
                order.set_delivery_type('none');
            }
            if(order){
                var env = {
                    widget:self,
                    pos: self.pos,
                    order: order,
                    receipt: order.export_for_printing(),
                    orderlines: order.get_orderlines(),
                    paymentlines: order.get_paymentlines(),
                };
                var receipt_html = QWeb.render('PosTicket',env);
                order.set_pos_normal_receipt_html(receipt_html.replace(/<img[^>]*>/g,"").replace(/<object[^>]*>/g,""));
                var receipt = QWeb.render('XmlReceipt',env);
                order.set_pos_xml_receipt_html(receipt.replace(/<img[^>]*>/g,"").replace(/<object[^>]*>/g,""));
                self.pos.push_order(order);
                self.pos.gui.show_screen('receipt');
            }
        },
        do_order: function(order, type){
            var self = this;
            var order = order || this.pos.get_order();
            var tdebit = type === 'debit';
            var tcredit = type === 'credit';
            var tmealplan = type === 'mealplan';
            if (tdebit){
                order.set_order_on_debit(tdebit);
                order.set_is_debit(tdebit);
            }else if(tcredit){
                order.set_order_on_credit(tcredit);
                order.set_is_credit(tcredit);
            }else if (tmealplan){
                order.set_order_on_meal_plan(tmealplan);
                order.set_is_meal_plan(tmealplan);
            }

            order.set_delivery(true);
            var currentOrderLines = order.get_orderlines();
            var orderLines = [];
            _.each(currentOrderLines,function(item) {
                return orderLines.push(item.export_as_JSON());
            });

            var client = order.get_client();

            if (tdebit){
                var debit = order.get_total_with_tax() - order.get_total_paid();
                if (debit > client.remaining_debit_amount){
                    return self.gui.show_popup('max_limit',{
                        remaining_debit_limit: client.remaining_debit_amount,
                        draft_order: true,
                    });
                    return
                }
            }else if(tcredit){
                var credit = order.get_total_with_tax() - order.get_total_paid();
                if (credit > client.remaining_credit_limit){
                    return self.gui.show_popup('max_limit',{
                        remaining_debit_limit: client.remaining_credit_limit,
                        draft_order: true,
                    });
                    return
                }
            }else if (tmealplan){
                var meal_plan = order.get_total_with_tax() - order.get_total_paid();
                if (meal_plan > client.remaining_meal_plan_limit){
                    return self.gui.show_popup('max_limit',{
                        remaining_debit_limit: client.remaining_meal_plan_limit,
                        draft_order: true,
                    });
                    return
                }
            }
            self.pos.push_order(order);
            self.gui.show_screen('receipt');
            if (self.pos.config.iface_print_auto){
                if (!self._locked) {
                    setTimeout(function(){
                        order.finalize();
                    }, 500);
                }
            }

            /*
            if (client && debit && debit > client.remaining_debit_amount){
                self.gui.show_popup('max_limit',{
                    remaining_debit_limit: client.remaining_debit_amount,
                    draft_order: true,
                });
                return
            } else if (client && credit && credit > client.remaining_credit_limit){
                self.gui.show_popup('max_limit',{
                    remaining_debit_limit: client.remaining_credit_limit,
                    draft_order: true,
                });
                return
            }else if (client && meal_plan && meal_plan > client.remaining_meal_plan_limit){
                self.gui.show_popup('max_limit',{
                    remaining_debit_limit: client.remaining_meal_plan_limit,
                    draft_order: true,
                });
                return
            }else{
                self.pos.push_order(order);
                self.gui.show_screen('receipt');
            }
            */
        },
        // pos debit click
        pos_credit: function(e){
            var self = this;
            this.to_invoice = true;
            var order = self.pos.get_order();
            var order_lines = order.get_paymentlines();
            if(order_lines.length && order.get_due() <= 0){
                this.pos.db.notification('danger', 'No puede agregar un método de pago cuando ya ha cubierto el total a pagar.');
                return false;
            }
            var client = order.get_client() || false;
            if (client && client.remaining_credit_limit <= 0) {
                this.pos.db.notification('danger', 'No es posible pagar utilizando crédito ya que el cliente seleccionado no tiene crédito disponible.');
                return false;
            }
            if(order.is_empty()){
                self.pos.db.notification('danger',_t('Add product(s) in cart!'));
                return
            }
            if (!order.get_client()){
                self.pos.db.notification('danger',_t('Please select customer!'));
                self.pos.gui.show_screen('clientlist', {valid_credit: true, payment: self});
                return
            }

            if (client){
                if (client.client_pin){
                    var credit_amount = client.remaining_credit_limit;
                    var amount = order.getNetTotalTaxIncluded();
                    if (amount > credit_amount){
                        if (order.get_paymentlines().length > 0){
                            var total_amount = 0
                            _.map(order.get_paymentlines(), function(plines){
                                var pamount = plines.get_amount();
                                total_amount += pamount;
                            });
                            if (total_amount > 0){
                                if (total_amount === amount){
                                    self.gui.show_popup('show_pop_pin', {cashier: client, payment: self, type: 'credit', is_low_credit: true});
                                    return
                                }else{
                                    return self.pos.db.notification('danger', _t('Es necesario agregar otro método de pago para saldar la venta.'))
                                }
                            }
                        }else{
                            var cashregister = false;
                            for(var i in self.pos.cashregisters){
                                var reg = self.pos.cashregisters[i];
                                if(reg.journal_id[1] === "POS-Crédito (MXN)"){
                                    cashregister = reg;
                                }
                            }
                            if (cashregister){
                                //var order = self.pos.get_order();
                                order.add_paymentline(cashregister);
                                order.selected_paymentline.set_amount(credit_amount,0 );
                                self.reset_input();
                                self.render_paymentlines();
                                self.order_changes();
                            }
                        }
                    }else{
                        self.gui.show_popup('show_pop_pin', {cashier: client, payment: self, type: 'credit'});
                        return
                    }

                }else{
                    self.pos.db.notification('danger', _t('Por favor asigna un PIN al cliente'));
                    return;
                }
            }

            if(order.get_ret_o_id()){
                self.pos.db.notification('danger',_t('Sorry, This operation not allow to create draft order!'));
                return
            }
            /*
            order.set_order_on_credit(true)
            order.set_is_credit(true);
            order.set_delivery(true)
            var currentOrderLines = order.get_orderlines();
            var orderLines = [];
            _.each(currentOrderLines,function(item) {
                return orderLines.push(item.export_as_JSON());
            });
            var credit = order.get_total_with_tax() - order.get_total_paid();
            var client = order.get_client();
            if (client && credit > client.remaining_credit_limit){
                self.gui.show_popup('max_limit',{
                    remaining_debit_limit: client.remaining_credit_limit,
                    draft_order: true,
                });
                return
            } else {
                self.pos.push_order(order);
                self.gui.show_screen('receipt');
            }
            */
        },
        // pos debit click
        pos_debit: function(e){
            this.to_invoice = true;
            var order = self.pos.get_order();
            if(order.is_empty()){
                self.pos.db.notification('danger',_t('Add product(s) in cart!'));
                return
            }
            if (!order.get_client()){
                self.pos.db.notification('danger',_t('Please select customer!'));
                self.pos.gui.show_screen('clientlist', {'valid_debit': true, 'payment': this});
                return
            }

            var client = order.get_client() || false;

            if (client){
                if (client.client_pin){
                     self.gui.show_popup('show_pop_pin', {cashier: client, payment: self, type: 'debit'});
                    return
                }else{
                    self.pos.db.notification('danger', _t('Por favor asigna un PIN al cliente'));
                    return;
                }
            }

            if(order.get_ret_o_id()){
                self.pos.db.notification('danger',_t('Sorry, This operation not allow to create draft order!'));
                return
            }
            //this.do_order(order);
        },
        // pos meal plan click
        pos_meal_plan: function(e){
            this.to_invoice = true;
            var order = self.pos.get_order();
            if(order.is_empty()){
                self.pos.db.notification('danger',_t('Add product(s) in cart!'));
                return
            }
            if (!order.get_client()){
                self.pos.db.notification('danger',_t('Please select customer!'));
                self.pos.gui.show_screen('clientlist', {valid_meal_plan: true, payment: self});
                return
            }

            var client = order.get_client() || false;

            if (client){
                if (client.client_pin){
                     self.gui.show_popup('show_pop_pin', {cashier: client, payment: self, type: 'mealplan'});
                    return
                }else{
                    self.pos.db.notification('danger', _t('Por favor asigna un PIN al cliente'));
                    return;
                }
            }
            /*if (client && client.client_pin){
                self.gui.show_popup('show_pop_pin', {cashier: client, payment: self, type: 'mealplan'});
                return
            }*/

            if(order.get_ret_o_id()){
                self.pos.db.notification('danger',_t('Sorry, This operation not allow to create draft order!'));
                return
            }
            /*
            order.set_order_on_meal_plan(true)
            order.set_is_meal_plan(true);
            order.set_delivery(true)
            var currentOrderLines = order.get_orderlines();
            var orderLines = [];
            _.each(currentOrderLines,function(item) {
                return orderLines.push(item.export_as_JSON());
            });
            var debit = order.get_total_with_tax() - order.get_total_paid();
            var client = order.get_client();
            if (client && debit > client.remaining_meal_plan_limit){
                self.gui.show_popup('max_limit',{
                    remaining_debit_limit: client.remaining_meal_plan_limit,
                    draft_order: true,
                });
                return
            } else {
                self.pos.push_order(order);
                self.gui.show_screen('receipt');
            }
            */
        },
        credit_assign: function(e){
            $(".account_payment_btn").html("");
            var self = this;
            var order = self.pos.get_order();

            var partner = order.get_client();
            var add_class = false;
            if($(e.currentTarget).hasClass('account_pay')){
                add_class = false;
                $(e.currentTarget).removeClass('account_pay');
                var lines = self.pos.get_order().get_orderlines()
                var new_amount = Number($(e.currentTarget).attr('use_amt'));
                var order_amount = order.get_total_with_tax();
                var to_be_remove = false
                var credit_detail = order.get_credit_detail();
                var journal_id = Number($(e.currentTarget).attr('journal_id'));
                for (var i=0;i<lines.length;i++){
                    if(lines[i].product.id == self.pos.config.prod_for_payment[0]){
                        for (var j=0;j<credit_detail.length;j++){
                            if(lines[i].price == (-credit_detail[j].amount)){
                                to_be_remove = lines[i].id
                                break
                            }
                        }
                    }
                }
                for(var i=0;i<credit_detail.length;i++){
                    if(credit_detail[i].journal_id == journal_id){
                        credit_detail.splice(i, 1);
                    }
                }
                 if(order.get_orderline(to_be_remove)){
                     order.remove_orderline(order.get_orderline(to_be_remove));
                 }
                var pos_total_amount = 0.00
                var order_details =  order.get_credit_detail()
                 _.each(order_details,function(order_detail) {
                    pos_total_amount += order_detail.amount
                });
                 self.pos.credit_amount = pos_total_amount;
                 var tabs = QWeb.render('FromCredit',{widget:self});
                 $('.foreign_infoline').html(tabs);
            }else{
                $(e.currentTarget).addClass('account_pay');
                var journal = $(e.currentTarget).attr('journal');
                var journal_id = Number($(e.currentTarget).attr('journal_id'));
                var amount = Number($(e.currentTarget).attr('amt'));
                var order_amount = order.get_total_with_tax();
                var prd = self.pos.db.get_product_by_id(self.pos.config.prod_for_payment[0]);
                var lines = self.pos.get_order().get_orderlines()
                self.pos.credit = true;
                self.pos.cmp_journal_id = journal_id;
                if(prd && order_amount != 0.00){
                      if(order_amount < amount){
                        var paid_amt =  order_amount;
                      } else{
                            var paid_amt = amount;
                      }
//                      if(lines.length > 0){
//                    	  _.each(lines,function(line){
//                    		  if(line.product.id == prd.id){
//                    			  order.remove_orderline(line)
//                    		  }
//                    	  });
//                      }
                      order.add_product(prd,{'price':-paid_amt});
                      $(e.currentTarget).attr('use-amt',-paid_amt);
                       var select_line = order.get_selected_orderline();
                       if(select_line){
                            select_line.set_from_credit(true);
                            var credit_info = {
                                'partner_id':partner.id,
                                'amount':paid_amt,
                                'journal':journal,
                                'journal_id':journal_id
                            }
                            order.set_credit_detail(credit_info);
                       }
                }
                var pos_total_amount = 0.00
                var order_details =  order.get_credit_detail()
                _.each(order_details,function(order_detail) {
                    pos_total_amount += order_detail.amount
                });
                self.pos.credit_amount = pos_total_amount;
                var tabs = QWeb.render('FromCredit',{widget:self});
                this.$('.foreign_infoline').html(tabs);
            }
            var p_line = order.get_paymentlines();
            if(p_line.length > 0){
                self.pos.gui.screen_instances.payment.render_paymentlines()
            }
        },
        init: function(parent, options) {
            var self = this;
            this._super(parent, options);
            this.div_btns = "";
            var payment_buttons = this.pos.config.payment_buttons;
            var payment_buttons_order = new Array(payment_buttons.length);
            var index = 0;
            for(var i in payment_buttons) {
                var btn_info = this.pos.db.get_button_by_id(payment_buttons[i]);
                if (!payment_buttons_order[0]) {
                    payment_buttons_order[index] = btn_info;
                }
                else {
                    payment_buttons_order[index] = btn_info;
                    for (var j = 0; j < index; j++) {
                        try {
                            if (parseFloat(payment_buttons_order[j].display_name) > parseFloat(payment_buttons_order[index].display_name)) {
                                var aux = payment_buttons_order[j];
                                payment_buttons_order[j] = payment_buttons_order[index];
                                payment_buttons_order[index] = aux;
                            }
                        }
                        catch (e) {
                            alert("Error al ordenar");
                        }
                    }
                }
                index += 1;
            }
            var columns = index % 4 > 0 ? Math.floor(index / 4) + 1 : Math.floor(index / 4);
            var columns_html = [];
            for (var i = 0; i < columns; i++) {
                columns_html.push("<div>");
            }

            for(var j = index - 1; j >= 0; j -= columns) {
                for (var i = 1; i <= columns; i++){
                    if(j - (i - 1) >= 0) {
                        var amount_data = round_di(payment_buttons_order[j - (i - 1)].display_name, 0).toFixed(0);
                        var amount = field_utils.format.float(round_di(payment_buttons_order[j - (i - 1)].display_name, 0), {digits: [69, 0]});
                        columns_html[i - 1] += "<div id=" + payment_buttons_order[j - (i - 1)].id + " class='control-button 1quickpay' data=" + amount_data + "><span>" + amount + "</span></div>";
                    }
                }
            }
            for (var i = columns - 1; i >= 0; i--) {
                this.div_btns += columns_html[i] + "</div>"
            }

            this.use_credit = function(event){
                var order = self.pos.get_order();
                if(order.get_due() <= 0){
                    return;
                }
                order.set_use_credit(!order.get_use_credit());
                if (order.get_use_credit()) {
                    if(order.get_client()){
                        var params = {
                            model: "res.partner",
                            method: "search_read",
                            domain: [['id', '=', order.get_client().id]],
                            fields:['remaining_credit_amount']
                        }
                        rpc.query(params, {async: false})
                        .then(function(results){
                            if(results && results[0]){
                                if(results[0].remaining_credit_amount <= 0){
                                    return
                                }
                                $('div.js_use_credit').addClass('highlight');
                                var result = results[0];
                                var price = 0;
                                if(order.get_total_with_tax() < result.remaining_credit_amount){
                                    var rem = self.pos.get_order().get_due();
                                    price = rem || order.get_total_with_tax() * -1;
                                    order.set_type_for_credit('return');
                                    self.click_paymentmethods_by_journal(self.pos.config.pos_journal_id[0]);
                                }else if(order.get_total_with_tax() >= result.remaining_credit_amount){
                                    order.set_type_for_credit('change');
                                    var rem_due = self.pos.get_order().get_due();
                                    self.click_paymentmethods_by_journal(self.pos.config.pos_journal_id[0]);
                                    price = Math.min(rem_due,Math.abs(result.remaining_credit_amount * -1));
                                }else{
                                    order.set_type_for_credit('change');
                                }
                                self.renderElement();
                            }
                        });
                    }else {
                        alert(_t('Please select a customer to use Credit !'));
                    }
                }else {
                    $('.js_use_add_paymentlinecredit').removeClass('highlight');
                    self.renderElement();
                }
            };
            this.keyboard_handler = function(event){
                var key = '';
                if (event.type === "keypress") {
                    if (event.keyCode === 13 && self.pos.get_login_from() != 'login') { // Enter
                        self.validate_order(false);
                    } else if ( event.keyCode === 190 || // Dot
                                event.keyCode === 110 ||  // Decimal point (numpad)
                                event.keyCode === 188 ||  // Comma
                                event.keyCode === 46 ) {  // Numpad dot
                        key = self.decimal_point;
                    } else if (event.keyCode >= 48 && event.keyCode <= 57) { // Numbers
                        key = '' + (event.keyCode - 48);
                    } else if (event.keyCode === 45) { // Minus
                        key = '-';
                    } else if (event.keyCode === 43) { // Plus
                        key = '+';
                    }else{
                        self.pos.set_login_from(false);
                    }
                } else { // keyup/keydown
                    if (event.keyCode === 46) { // Delete
                        key = 'CLEAR';
                    } else if (event.keyCode === 8) { // Backspace
                        key = 'BACKSPACE';
                    }
                }
                self.payment_input(key);
                event.preventDefault();
                event.stopImmediatePropagation();
            };
            this.use_wallet = function(event){
                var order = self.pos.get_order();
                if(order.getNetTotalTaxIncluded() <= 0){
                    return
                }
                order.set_use_wallet(!order.get_use_wallet());
                if (order.get_use_wallet()) {
                    if(order.get_client()){
                        if(self.pos.config.wallet_product.length > 0){
                            $('div.js_use_wallet').addClass('highlight');
                            var product = self.pos.db.get_product_by_id(self.pos.config.wallet_product[0]);
                            var params = {
                                model: "res.partner",
                                method: "search_read",
                                domain: [['id', '=', order.get_client().id]],
                                fields:['remaining_wallet_amount']
                            }
                            rpc.query(params, {async: false})
                            .then(function(results){
                                if(!product){
                                    return self.pos.db.notification('warning',"Wallet product is not loaded into pos, Please remove product cache from pos configuration and try again.");
                                }
                                _.each(results, function(result){
                                    var price = 0;
                                    var line = new models.Orderline({}, {pos: self.pos, order: order, product: product});
                                    if(order.get_total_with_tax() <= result.remaining_wallet_amount){
                                        price = order.get_total_with_tax() * -1;
                                    }else if(order.get_total_with_tax() >= result.remaining_wallet_amount){
                                        price = result.remaining_wallet_amount * -1;
                                    }
                                    order.set_used_amount_from_wallet(Math.abs(price));
                                    order.set_type_for_wallet('change');
                                    line.set_quantity(1);
                                    line.set_unit_price(price);
                                    order.add_orderline(line);
                                    self.renderElement()
                                });
                            });
                        }
                    }else{
                        self.pos.db.notification('danger',"Please select customer!");
                    }
                } else{
                    $('.js_use_wallet').removeClass('highlight');
                    order.set_used_amount_from_wallet(false)
                    _.each(order.get_orderlines(), function(line){
                        if(line && line.get_product().id === self.pos.config.wallet_product[0]){
                            order.remove_orderline(line);
                        }
                    });
                    self.renderElement();
                }
            };
        },
        click_back: function(){
            var self = this;
            var order = this.pos.get_order();
            if(!order.get_table_reservation_details()){
                if((order.get_credit_detail() && order.get_credit_detail()[0])){
                    this.gui.show_popup('confirm',{
                        title: _t('Discard Order'),
                        body:  _t('Do you want to discard the Order'),
                        confirm: function() {
                            self.pos.chrome.screens.orderlist.clear_cart();
                            order.set_client(null);
                            order.set_order_id(false);
                            self.pos.gui.show_screen('products');
                        },
                    });
                } else {
                    var paymentlines = order.get_paymentlines();
                    var cid_paymentlines = [];
                    _.each(paymentlines, function(paymentline){
                       cid_paymentlines.push(paymentline.cid);
                    });
                    _.each(cid_paymentlines, function (cid) {
                        self.chrome.screens.payment.click_delete_paymentline(cid);
                    });
                    order.set_client(false);
                    self._super();
                }
            }
        },
        finalize_validation: function() {
            var self = this;
            var order = this.pos.get_order();
            var partner = this.pos.get_client();
//            if(partner && partner.remaining_credit_amount && order.get_remaining_credit()){
            if(partner){
                partner.remaining_credit_amount = order.get_remaining_credit();
            }
            if(self.pos.config.enable_gift_voucher){
                var vouchers = order.get_voucher();
                var counter = [];
                if(vouchers && vouchers.length > 0){
                    var voucher_use = _.countBy(vouchers, 'voucher_code');
                    _.each(vouchers, function(voucher){
                        if(_.where(counter, {voucher_code: voucher.voucher_code}).length < 1){
                            counter.push({
                                voucher_name : voucher.display_name,
                                voucher_code: voucher.voucher_code,
                                remaining_redeemption: voucher.redemption_customer - (voucher.already_redeemed > 0 ? voucher.already_redeemed + voucher_use[voucher.voucher_code] : voucher_use[voucher.voucher_code]),
                            });
                        }
                    });
                    order.set_remaining_redeemption(counter);
                }
            }
            if(self.pos.config.generate_token){
                if(order){
                    self.pos.increment_number = Number(self.pos.increment_number);
                    if(!order.get_is_update_increnement_number()){
                        if(Number(self.pos.zero_pad(self.pos.increment_number, self.pos.last_token_number.toString().length)) >= self.pos.last_token_number){
                            self.pos.increment_number = 1;
                        }else{
                            self.pos.increment_number += 1;
                        }
                    }else{
                        if(Number(order.get_temp_increment_number())){
                            self.pos.increment_number = Number(order.get_temp_increment_number());
                        }
                    }
                    self.pos.increment_number = self.pos.zero_pad(self.pos.increment_number, self.pos.last_token_number.toString().length);
                }
            }
            var env = {
                widget:self,
                pos: self.pos,
                order: order,
                receipt: order.export_for_printing(),
                orderlines: order.get_orderlines(),
                paymentlines: order.get_paymentlines(),
            };
            var receipt_html = QWeb.render('PosTicket',env);
            order.set_pos_normal_receipt_html(receipt_html.replace(/<img[^>]*>/g,"").replace(/<object[^>]*>/g,""));
            var receipt = QWeb.render('XmlReceipt',env);
            order.set_pos_xml_receipt_html(receipt.replace(/<img[^>]*>/g,"").replace(/<object[^>]*>/g,""));
            self._super();
        },
//    	partial_payment: function() {
//            var self = this;
//            var currentOrder = this.pos.get_order();
//            var client = currentOrder.get_client() || false;
//            if(currentOrder.get_total_with_tax() > 0 && currentOrder.get_due() != 0){
//				if(currentOrder.get_total_with_tax() > currentOrder.get_total_paid()
//        			&& currentOrder.get_total_paid() != 0){
//					var credit = currentOrder.get_total_with_tax() - currentOrder.get_total_paid();
//					if (client && credit > client.remaining_credit_limit && !currentOrder.get_paying_due()){
//						self.gui.show_popup('max_limit',{
//							remaining_credit_limit: client.remaining_credit_limit,
//							payment_obj: self,
//						});
//						return
//					}
//        	    }
//				currentOrder.set_partial_pay(true);
//				if(currentOrder.get_total_paid() != 0){
//					if(self.pos.config.enable_delivery_charges){
//						var delivery_info = self.check_delivery_info();
//						if(delivery_info){
//							return self.pos.db.notification('danger',_t('Delivery information required to validate order!'));
//						}
//					}
//					this.finalize_validation();
//				}
//        	}
//        },
        partial_payment: function() {
            var self = this;
            var currentOrder = this.pos.get_order();
            var client = currentOrder.get_client() || false;
            var partner = this.pos.get_client();
            if(partner && partner.remaining_credit_amount && currentOrder.get_remaining_credit()){
                partner.remaining_credit_amount = currentOrder.get_remaining_credit();
            }
            if(currentOrder.get_total_with_tax() > currentOrder.get_total_paid() && currentOrder.get_total_paid() > 0){
                var credit = currentOrder.get_total_with_tax() - currentOrder.get_total_paid();
                this.finalize_validation();
            }
        },
        check_delivery_info: function(){
            var self = this;
            var order = self.pos.get_order();
            // delivery charges
            if(self.pos.config.enable_delivery_charges){
                var time = order.get_delivery_time();
                if(!time){
                    time = $("#txt_del_time").val();
                    if(time){
                        order.set_delivery_time(time);
                    }
                }
                var address = order.get_delivery_address();
                if(!address){
                    address = $('#txt_del_add').val();
                    if(address){
                        order.set_delivery_address(address);
                    }
                }
                var date = order.get_delivery_date();
                var is_deliver = order.get_is_delivery();

                if(is_deliver && (!date || !time || !address)){
                    return true;
                }
            }
        },
        click_redeem_loyalty: function(){
            var order = this.pos.get_order();
            if(order.get_client()){
                this.gui.show_popup("redeem_loyalty_points", {payment_self: this});
            }
        },
        payment_input: function(input) {
            var self = this;
            var order = this.pos.get_order();
            if(order.selected_paymentline && order.selected_paymentline.get_freeze_line()){
                return
            }
            if(order.selected_paymentline && order.selected_paymentline.get_freeze()){
                return
            }

            var customer_display = self.pos.config.customer_display;

            var old_inputbuffer = this.inputbuffer;
            var newbuf = this.gui.numpad_input(this.inputbuffer, input, {'firstinput': this.firstinput});
            this.firstinput = (newbuf.length === 0);

            // popup block inputs to prevent sneak editing.
            if (this.gui.has_popup()) {
                return;
            }

            if (newbuf !== this.inputbuffer) {
                this.inputbuffer = newbuf;
                var order = this.pos.get_order();
                if (order.selected_paymentline) {
                    var amount = this.inputbuffer;

                    if (this.inputbuffer !== "-") {
                        amount = field_utils.parse.float(this.inputbuffer);
                    }

                    if (order.selected_paymentline.name == "Tarjeta Bancaria (MXN)" && order.get_subtotal() < order.get_total_paid() - order.selected_paymentline.get_amount() + amount){
                        self.pos.db.notification('danger',"No puede pagar más del total a pagar usando Tarjeta Barcaria.");
                        this.inputbuffer = old_inputbuffer;
                        this.firstinput = (this.inputbuffer.length === 0);
                        return;
                    }

                    order.selected_paymentline.set_amount(amount);
                    this.order_changes();
                    this.render_paymentlines();
                    this.$('.paymentline.selected .edit').text(this.format_currency_no_symbol(amount));
                }
            }
            if(customer_display){
                order.mirror_image_data();
            }
        },
        toggle_rounding_button: function(){
            var self = this;
            var order = this.pos.get_order();
            var $rounding_elem = $('#pos-rounding');
            if($rounding_elem.hasClass('fa-toggle-off')){
                $rounding_elem.removeClass('fa-toggle-off');
                $rounding_elem.addClass('fa-toggle-on');
                order.set_rounding_status(true);
            } else if($rounding_elem.hasClass('fa-toggle-on')){
                $rounding_elem.removeClass('fa-toggle-on');
                $rounding_elem.addClass('fa-toggle-off');
                order.set_rounding_status(false);
            }
            this.render_paymentlines();
        },
        show: function() {
            var self = this;
            self._super();

            var order = self.pos.get_order();
            var total = order ? order.get_total_with_tax() : 0;

            var client = order.get_client();

            if (client){
                var params = {
                    model: 'res.partner',
                    method: 'search_read',
                    fields: ['esquema_subsidio_ids'],
                    domain: [['id', '=', client.id]]
                }
                rpc.query(params).then(function(results){
                    if (results.length > 0){
                        var p = {
                            model: 'contract.scheme.contract',
                            method: 'search_read',
                            domain: [['id', 'in', results[0].esquema_subsidio_ids]]
                        }
                        rpc.query(p).then(function(data){
                            if (data.length > 0){
                                self.$el.find('.paymentlines-container').after(QWeb.render('Payment-Sub', {data: data[0]}));
                                $('.button-add-sub').click(function(){
                                    var amt = $(this).attr('data') ? Number($(this).attr('data')) : false;

                                    if(amt){
                                        var cashregister = false;
                                        for(var i in self.pos.cashregisters){
                                            var reg = self.pos.cashregisters[i];
                                            if(reg.journal_id[0] == self.pos.config.cash_method[0] ){
                                                cashregister = reg;
                                            }
                                        }
                                        if (cashregister){
                                            cashregister.journal_id[0] = 27;
                                            cashregister.journal_id[1] = 'POS - Debito (MXN)';
                                            var order = self.pos.get_order();
                                            order.add_paymentline(cashregister);
                                            order.selected_paymentline.set_amount( Math.max(amt),0 );
                                            self.reset_input();
                                            self.render_paymentlines();
                                            self.order_changes();
                                            if(self.pos.config.validate_on_click){
                                                self.pre_validate_order();
                                            }
                                        }
                                    }
                                    //self.click_paymentmethods($(this).data('id'));
                                });
                                var currentOrderline = order.get_orderlines();
                                _.each(currentOrderline, function(line){
                                });
                            }
                        });
                    }
                });
            }

            self.$('#partial_pay').text("Partial Pay");
            order.set_credit_mode(false)
            if(order && order.get_client()){
                $('.js_use_credit').show();
                this.remaining_balance = order.get_client().remaining_credit_amount;
                self.renderElement();
            }else{
                $('.js_use_credit').hide();
            }
            if(order.get_total_with_tax() > 0){
                if((order.get_paying_due())){
                    self.$('#partial_pay, .next').show();
                }
            } else {
                self.$('#partial_pay').hide();
                self.$('.next').show();
            }
            if((order.get_paying_due())){
                self.$('#partial_pay').text("Pay");
            }

            $("#payment_total").html(this.format_currency(order.getNetTotalTaxIncluded()));
            $("#payment_total").attr('amount',order.getNetTotalTaxIncluded());

            var partner = self.pos.get_order().get_client();
            if(partner)
            {
                this.$el.find("#remaining_debit_amount").text(self.format_currency(partner.remaining_debit_amount));
                this.$el.find("#remaining_credit_amount").text(self.format_currency(partner.remaining_credit_limit));
                this.$el.find("#remaining_meal_plan_limit").text(self.format_currency(partner.remaining_meal_plan_limit));
            }else{
                this.$el.find("#remaining_debit_amount").text('0.0');
                this.$el.find("#remaining_credit_amount").text('0.0');
                this.$el.find("#remaining_meal_plan_limit").text('0.0');
            }

            $("#email_id").focus(function() {
                $('body').off('keypress', self.keyboard_handler);
                $('body').off('keydown',self.keyboard_keydown_handler);
            });
            $("#email_id").focusout(function() {
                $('body').off('keypress', self.keyboard_handler).keypress(self.keyboard_handler);
                $('body').off('keydown', self.keyboard_keydown_handler).keydown(self.keyboard_keydown_handler);
            });
            $("textarea#order_note").focus(function() {
                $('body').off('keypress', self.keyboard_handler);
                $('body').off('keydown',self.keyboard_keydown_handler);
            });
            $("textarea#order_note").focusout(function() {
                order.set_order_note($('textarea#order_note').val());
                $('body').off('keypress', self.keyboard_handler).keypress(self.keyboard_handler);
                $('body').off('keydown', self.keyboard_keydown_handler).keydown(self.keyboard_keydown_handler);
            });
            $("textarea#txt_del_add").focus(function() {
                $('body').off('keypress', self.keyboard_handler);
                $('body').off('keydown',self.keyboard_keydown_handler);
            });
            $("textarea#txt_del_add").focusout(function() {
                $('body').off('keypress', self.keyboard_handler).keypress(self.keyboard_handler);
                $('body').off('keydown', self.keyboard_keydown_handler).keydown(self.keyboard_keydown_handler);
            });
            if(order.get_is_delivery()){
                $('#delivery_details').show();
                $('.button.unpaid_draft_order').show();
                if(order.get_delivery_date()){
                    $('#txt_del_date').val(order.get_delivery_date());
                }
                if(order.get_delivery_time()){
                    $('#txt_del_time').val(order.get_delivery_time());
                }
                if(order.get_delivery_address()){
                    $('#txt_del_add').val(order.get_delivery_address());
                } else if(order.get_client()){
                    $('#txt_del_add').val(order.get_client().address);
                }
                self.$("#txt_del_date").datepicker({
                    minDate: 0,
                    onSelect: function(dateText, inst) {
                        order.set_delivery_date(dateText);
                    },
                });
                self.$("#txt_del_time").timepicker({
                    'timeFormat': 'h:i A',
                });
                self.$("#txt_del_time").change(function(){
                    var time = $("#txt_del_time").val();
                    order.get_delivery_time(time);
                })
                self.$('#txt_del_add').change(function(){
                    var address = $('#txt_del_add').val();
                    order.set_delivery_address(address);
                });
            }else{
                $('#delivery_details').hide();
                $('.button.unpaid_draft_order').hide();
            }
            if(self.pos.config.enable_order_note) {
                if(!$('#order_note').val() && order.get_order_note()){
                    $('#order_note').val(order.get_order_note());
                }
            }
            if (client){
                if (total > client.remaining_debit_amount){
                    this.$el.find("#remaining_debit_amount").addClass('invalid');
                    this.$el.find('#pos-debit').addClass('disabled');
                    this.$el.find('#pos-debit').text('Prepago - Débito (Sin saldo suficiente)');
                }else{
                    this.$el.find("#remaining_debit_amount").removeClass('invalid');
                    this.$el.find('#pos-debit').removeClass('disabled');
                    this.$el.find('#pos-debit').text('Prepago - Débito');
                }

                if (total > client.remaining_credit_limit){
                    //this.$el.find("#remaining_credit_amount").addClass('invalid');
                    //this.$el.find('#pos-credit').addClass('disabled');
                    this.$el.find('#pos-credit').text('Crédito salda con: ' + self.format_currency(client.remaining_credit_limit));
                    this.is_low_credit = true;
                }else{
                    this.$el.find("#remaining_credit_amount").removeClass('invalid');
                    this.$el.find('#pos-credit').removeClass('disabled');
                    this.$el.find('#pos-credit').text('Crédito');
                }

                if(total > client.remaining_meal_plan_limit){
                    this.$el.find("#remaining_meal_plan_limit").addClass('invalid');
                    this.$el.find('#pos-meal-plan').addClass('disabled');
                    this.$el.find('#pos-meal-plan').text('Meal Plan (Sin saldo suficiente)');
                }else{
                    this.$el.find("#remaining_meal_plan_limit").removeClass('invalid');
                    this.$el.find('#pos-meal-plan').removeClass('disabled');
                    this.$el.find('#pos-meal-plan').text('Meal Plan');
                }
            }else{
                this.$el.find("#remaining_debit_amount").removeClass('invalid');
                this.$el.find('#pos-debit').removeClass('disabled');
                this.$el.find('#pos-debit').text('Prepago - Débito');
                this.$el.find("#remaining_credit_amount").removeClass('invalid');
                this.$el.find('#pos-credit').removeClass('disabled');
                this.$el.find('#pos-credit').text('Crédito');
                this.$el.find("#remaining_meal_plan_limit").removeClass('invalid');
                this.$el.find('#pos-meal-plan').removeClass('disabled');
                this.$el.find('#pos-meal-plan').text('Meal Plan');
            }
        },
        validate_order: function(force_validation) {
            var self = this;
            var order = this.pos.get_order();
            var self = this;
            var client = order.get_client();

            if((this.pos.get_order().get_total_with_tax() < 0) && this.pos.get_order().get_paymentlines().length == 0){
                return alert(_t('Please select a journal.'));
            }
            if(self.pos.pos_session.locked){
                self.pos.db.notification('danger',"This session has been blocked can't process order.");
                return;
            }
            if(this.order_is_valid(force_validation)) {
                //Bind notes for Order for store on database
                if(this.pos.config.enable_order_note) {
                    order.set_order_note($('#order_note').val());
                }
                // E-receipt setup
                order.set_ereceipt_mail($('#email_id').val());
                if($('#is_ereciept').is(':checked')){
                    order.set_prefer_ereceipt(true);
                } else {
                    order.set_prefer_ereceipt(false);
                }
                if (order.get_client() && order.get_client().id && $('#update_email').is(':checked')) {
                    var params = {
                        model: "res.partner",
                        method: "write",
                        args: [order.get_client().id, {'email': order.get_ereceipt_mail()}]
                    }
                    rpc.query(params, {async: false}).fail(function(){
                        self.pos.db.notification('danger',"Connection lost");
                    });
                }
                // delivery charges
                if(self.pos.config.enable_delivery_charges){
                    var time = order.get_delivery_time();
                    if(!time){
                        time = $("#txt_del_time").val();
                        if(time){
                            order.set_delivery_time(time);
                        }
                    }
                    var address = order.get_delivery_address();
                    if(!address){
                        address = $('#txt_del_add').val();
                        if(address){
                            order.set_delivery_address(address);
                        }
                    }
                    var date = order.get_delivery_date();
                    var is_deliver = order.get_is_delivery();
                    if(is_deliver && !order.get_client()){
                        return self.pos.db.notification('danger',_t('Customer is required to validate delivery order!'));
                    }
                    if(is_deliver && (!date || !time || !address)){
                        return self.pos.db.notification('danger',_t('Delivery information required to validate order!'));
                    }
                    var delivery_user_id = $('.delivery_user').val();
                    if(order.get_delivery_user_id()){
                        delivery_user_id = order.get_delivery_user_id();
                    }
                    if(is_deliver && delivery_user_id == 0){
                        return self.pos.db.notification('danger',_t('Please select delivery user to validate order!'));
                    }else{
                        order.set_delivery_user_id(delivery_user_id);
                    }
                    if(is_deliver && date && time && address){
                        order.set_delivery_type('pending');
                    }
                }else{
                    order.set_delivery_type('none');
                }
                order.set_discount_history(true);
                if(order.get_discount_product_id() && order.get_order_total_discount() > 0){
                    order.set_discount_price(order.get_order_total_discount());
                    var product = self.pos.db.get_product_by_id(order.get_discount_product_id());
                    var new_line = new models.Orderline({}, {pos: self.pos, order: order, product: product});
                    new_line.set_quantity(-1);
                    new_line.state = 'done';
                    new_line.set_unit_price(order.get_order_total_discount());
                    order.add_orderline(new_line);
                    order.set_order_total_discount(0);
                }
            }else{
                return false;
            }
            if(self.pos.config.enable_card_charges && self.pos.get_cashier().access_card_charges){
                self.add_charge_product();
            }
            if(order.get_change() && self.pos.config.enable_wallet && self.pos.get_cashier().access_wallet){
                return self.gui.show_popup('AddToWalletPopup');
            }

            this._super(force_validation);
        },
        add_charge_product: function(){
            var self = this;
            var order = self.pos.get_order();
            var paylines = order.get_paymentlines();
            var charge_exist = false;
            var total_charges = 0;
            if(paylines){
                paylines.map(function(payline){
                    if(payline.cashregister.journal.apply_charges){
                        var paycharge = Number(payline.get_payment_charge());
                        total_charges += paycharge;
                        payline.set_amount(payline.get_amount() + paycharge);
                    }
                });
                if(total_charges > 0){
                    var product = self.pos.db.get_product_by_id(self.pos.config.payment_product_id[0]);
                    if(product){
//    					selectedOrder.add_product(product, {
//    						quantity: 1,
//    						price: Number(total_charges),
//    					});
                        var line = new models.Orderline({}, {pos: self.pos, order: order, product: product});
                        line.set_quantity(1);
                        line.state = 'done';
                        line.set_unit_price(total_charges);
                        order.add_orderline(line);
                    }
                }
            }
        },
        click_delete_paymentline: function(cid){
            var self = this;
            var lines = self.pos.get_order().get_paymentlines();
            var order = self.pos.get_order();
            var get_redeem = order.get_redeem_giftcard();
            var vouchers = order.get_voucher();
            for ( var i = 0; i < lines.length; i++ ) {
                if (lines[i].cid === cid) {
                    _.each(get_redeem, function(redeem){
                        if(lines[i].get_giftcard_line_code() == redeem.redeem_card ){
                            order.remove_card(lines[i].get_giftcard_line_code());
                        }
                    });
                    _.each(vouchers, function(j){
                        if (lines[i].get_gift_voucher_line_code() == j.voucher_code && j.voucher_amount == lines[i].amount){
                            order.remove_voucher(lines[i].get_gift_voucher_line_code(), lines[i].pid);
                        }
                    });
                    order.remove_paymentline(lines[i]);
                    self.reset_input();
                    self.render_paymentlines();
                    return
                }
            }
            self.order_changes();
            return;
        },
        order_is_valid: function(force_validation) {
            var self = this;

            var order = this.pos.get_order();
            if (order.get_voucher().length > 0 && !order.get_client()) {
                this.gui.show_popup('error',{
                    'title': _t('Voucher Used'),
                    'body':  _t('Customer is required for using Voucher.'),
                });
                return false;
            }
            // Validación para el método de pago por tarjeta bancaria
            var amount_card_payment = 0;
            var order_lines = order.get_paymentlines();
            var amount = order.getNetTotalTaxIncluded();
            _.map(order_lines, function(lines){
                    if(lines.name == "Tarjeta Bancaria (MXN)"){
                        amount_card_payment += lines.amount;
                    }
                });
            if(amount_card_payment > amount){
                self.pos.db.notification('danger', 'El total de pagos por tarjeta bancaria no puede ser mayor al monto de la orden');
                return false;
            }
            // --------------------------------------------------------
            var client = order.get_client();
            if(client){
                var params = {
                    model: 'contract.contract',
                    method: 'is_valid_order_date',
                    args:[client.id]
                }
                var valid = false;
                rpc.query(params,{async:false}).then(function(result){
                    valid = result.result
                });
                if(!valid){
                    self.pos.db.notification('danger', 'No tiene contrato ha vigente');
                    return false;
                }
                var params = {
                    model: 'res.partner',
                    method: 'search_read',
                    domain: [['id', '=', client.id]],
                    fields:['remaining_credit_limit','contract_ids','parent_id']
                };
                rpc.query(params,{async:false}).then(function(result){
                    if (client.remaining_credit_limit != result[0].remaining_credit_limit){
                        client.remaining_credit_limit = result[0].remaining_credit_limit;
                    }
                });
                var credit_limit = client.remaining_credit_limit;
                var credit_lines_amount = 0;
                var order_lines = order.get_paymentlines();
                _.map(order_lines, function(lines){
                    if(lines.name == "POS-Crédito (MXN)"){
                        credit_lines_amount += lines.amount;
                    }
                });
                if (credit_limit < credit_lines_amount){
                    self.pos.db.notification('danger', 'Crédito insuficiente para liquidar la orden');
                    return false;
                }

            }

            return this._super(force_validation);
        },
        order_changes: function(){
            var self = this;
            this.render_paymentlines();
            this._super();
            var order = this.pos.get_order();
            var total = order ? order.get_total_with_tax() : 0;
            if(!order){
                return;
            }
            else if(order.get_due() == total || order.get_due() == 0) {
                self.$('#partial_pay').removeClass('highlight');
            } else {
                self.$('#partial_pay').addClass('highlight');
            }
        },
        click_gift_voucher: function(event){
            var self = this;
            if(self.pos.get_order().getNetTotalTaxIncluded() <= 0){
                return
            }
            if(self.pos.get_order().get_client()){
                self.gui.show_popup('redeem_gift_voucher_popup', {'payment_self': self});
            } else {
                self.pos.db.notification('danger',_t("Customer is required"));
            }
        },
        open_order_note_popup: function(){
            this.gui.show_popup('line_note_popup');
        },
        click_rounding: function(){
            self.toggle_rounding_button();
        },
        click_set_customer: function(){
            var self = this;
            var lines = self.pos.get_order().get_paymentlines();
            var temp = _.find(lines, function(line){ return line.get_gift_voucher_line_code() })
            if(temp){
               return
            }
            this._super();
        },
        click_back_hold: function(){
            var self = this;
            var order = self.pos.get_order();
            if(order && order.get_giftcard() && order.get_giftcard()[0]){
                self.gui.show_popup('confirm',{
                       title: _t('Discard Gift Card'),
                       body:  _t('Do you want to discard the payment of gift card ?'),
                       confirm: function() {
                           order.finalize();
                       },
                   });
            }else if(order.get_paying_due()){
                this.gui.show_popup('confirm',{
                    title: _t('Discard Sale Order'),
                    body:  _t('Do you want to discard the payment of POS '+ order.get_pos_reference() +' ?'),
                    confirm: function() {
                        order.finalize();
                    },
                });
            } else{
                self.gui.show_screen('products');
            }
        },
        click_invoice: function(){
            var order = this.pos.get_order();
            if(order.get_paying_due()){
                return
            }
            this._super();
        },
        click_set_customer: function(){
            var order = this.pos.get_order();
            if(order.get_paying_due()){
                return
            }
            this._super();
        },
        render_paymentlines: function() {
            var self  = this;
            var order = this.pos.get_order();
            var customer_display = this.pos.config.customer_display;
            if (!order) {
                return;
            }

            var lines = order.get_paymentlines();
            var due   = order.get_due();
            var extradue = 0;
            var charge = 0;
            if (due && lines.length  && due !== order.get_due(lines[lines.length-1])) {
                extradue = due;
            }

            if(self.pos.config.enable_card_charges && self.pos.get_cashier().access_card_charges){
                if (order.selected_paymentline && order.selected_paymentline.cashregister.journal.apply_charges) {
                    if(order.selected_paymentline.cashregister.journal.optional){
                    }else{
                        if(order.selected_paymentline.cashregister.journal.fees_type === _t('percentage')){
                            charge = (order.selected_paymentline.get_amount() * order.selected_paymentline.cashregister.journal.fees_amount) / 100;
                        } else if(order.selected_paymentline.cashregister.journal.fees_type === _t('fixed')){
                            charge = order.selected_paymentline.cashregister.journal.fees_amount;
                        }
                    }
                    order.selected_paymentline.set_payment_charge(charge.toFixed(2));
                }
            }

            this.$('.paymentlines-container').empty();
            var lines = $(QWeb.render('PaymentScreen-Paymentlines', {
                widget: this,
                order: order,
                paymentlines: lines,
                extradue: extradue,
            }));

            lines.on('click','.delete-button',function(){
                self.click_delete_paymentline($(this).data('cid'));
                if(customer_display){
                    order.mirror_image_data();
                }
            });

            lines.on('click','.paymentline',function(){
                self.click_paymentline($(this).data('cid'));
//                if(customer_display){
//                	console.log("call >>> paymentline");
//                	order.mirror_image_data();
//        		}
            });

            lines.on('input','.payment_charge_input',function(){
                order.selected_paymentline.set_payment_charge($(this).val());
                if(customer_display){
                    order.mirror_image_data();
                }
            });

            if(self.pos.config.enable_card_charges && self.pos.get_cashier().access_card_charges) {
                lines.on('focus','.payment_charge_input',function(){
                    $('body').off('keypress', self.keyboard_handler);
                    $('body').off('keydown',self.keyboard_keydown_handler);
                });
                lines.on('focusout','.payment_charge_input',function(){
                    $('body').off('keypress', self.keyboard_handler).keypress(self.keyboard_handler);
                    $('body').off('keydown',self.keyboard_keydown_handler).keydown(self.keyboard_keydown_handler);
                });
            }

            lines.appendTo(this.$('.paymentlines-container'));
        },
        click_paymentmethods: function(id) {
//        	this._super(id);
            var is_online_journal = false;
            var cashregister = _.find(self.pos.cashregisters, function(cashregister){
                return cashregister.journal_id[0] === id;
            });
            var order = this.pos.get_order();
            var repeat = false;
            var order_lines = order.get_paymentlines();
            if(order_lines.length && order.get_due() <= 0){
                self.pos.db.notification('danger', 'No puede agregar un método de pago cuando ya ha cubierto el total a pagar.');
                return false;
            }
            _.map(order_lines, function(lines){
                    if(lines.name == cashregister.journal_id[1]){
                        repeat = true;
                    }
                });
            if(repeat){
                self.pos.db.notification('danger', 'No puede incluir dos métodos de pago del mismo tipo');
                return false;
            }
            if(cashregister && cashregister.journal.is_online_journal){
                is_online_journal = true;
            }
            if(is_online_journal){
                if(self.pos.get_order().get_online_ref_num()){
                    this._super(id);
                }else{
                    return self.gui.show_popup('token_popup', {'journal_id' : id});
                }
            } else{
                this._super(id);
            }
            var order = this.pos.get_order();
            var customer_display = this.pos.config.customer_display;
            if(customer_display){
                order.mirror_image_data();
            }
        },
        pre_validate_order: function(){
            var order = this.pos.get_order();

            if (!order.get_client()){
                this.validate_order(false);
            }
        },
        renderElement: function(){
            this._super();
            var self =  this;
            var order = self.pos.get_order();
            self.pos.credit = false;
            var customer_display = this.pos.config.customer_display;
            if(order){
                $("#payment_total").html(self.format_currency(order.getNetTotalTaxIncluded()));
            }
            if(order && order.get_is_delivery()){
                $('.button.unpaid_draft_order').show();
            }else{
                $('.button.unpaid_draft_order').hide();
            }
            if(self.pos.config.enable_wallet && self.pos.get_cashier().access_wallet){
                if(self.el.querySelector('.js_use_wallet')){
                    self.el.querySelector('.js_use_wallet').addEventListener('click', this.use_wallet);
                }
            }
            // $('.delivery_check').click(function(){
            //     $('.delivery_check').find('i').toggleClass('fa fa-toggle-on fa fa-toggle-off');
            // })
            this.$('#partial_pay').click(function(){
                var value = $('.delivery_check').find('i').hasClass('fa-toggle-on')
                if(value){
                    currentOrder.set_delivery(value)
                }
                self.partial_payment();
            });
            if(self.pos.config.enable_credit && self.pos.get_order() && self.pos.get_order().get_client()){
               self.el.querySelector('.js_use_credit').addEventListener('click', this.use_credit);
            }
            this.$('#partial_pay').click(function(){
                if(self.pos.get_order().get_client()){
                    self.partial_payment();
                } else {
                    self.gui.show_screen('clientlist');
                }
            });
            this.$('#is_ereciept').click(function(){
                var order = self.pos.get('selectedOrder');
                var customer_email = order.get_client() ? order.get_client().email : false;
                if($('#is_ereciept').is(':checked')) {
                    $('#email_id').fadeTo('fast', 1).css({ visibility: "visible" });
                    $('#email_id').focus();
                    if(order.get_client()){
                        $('#update_email_tr').show();
                    }
                    if(customer_email){
                        $('#email_id').val(customer_email);
                    } else {$('#email_id').val('');}
                } else {
                    $('#email_id').fadeTo('fast', 0, function () {
                        $('#email_id').css({ visibility: "hidden" });
                    });
                    $('#update_email_tr').hide();
                }
            });
            this.$('div.1quickpay').click(function(){
                var order = self.pos.get_order();
                var order_lines = order.get_paymentlines();
                if(order_lines.length && order.get_due() <= 0){
                    self.pos.db.notification('danger', 'No puede agregar un método de pago cuando ya ha cubierto el total a pagar.');
                    return false;
                }
                var amt = $(this).attr('data') ? Number($(this).attr('data')) : false;
                if(amt){
                    var cashregister = false;
                    for(var i in self.pos.cashregisters){
                        var reg = self.pos.cashregisters[i];
                        if(reg.journal_id[0] == self.pos.config.cash_method[0] ){
                            cashregister = reg;
                        }
                    }
                    if (cashregister){
                        order.add_paymentline(cashregister);
                        order.selected_paymentline.set_amount( Math.max(amt),0 );
                        self.reset_input();
                        self.render_paymentlines();
                        self.order_changes();
                        if(self.pos.config.validate_on_click){
                            self.pre_validate_order();
                        }
                        if (self.order_is_valid()){
                            if (self.pos.config.iface_print_auto){
                                if (!self._locked) {
                                    order.finalize();
                                }
                            }
                        }
                    }
                }
            });
            this.$('.emptybox_del_date').click(function(){
                var order = self.pos.get_order();
                $('#txt_del_date').val('');
                order.set_delivery_date(false);
            });
            this.$('.emptybox_del_time').click(function(){
                var order = self.pos.get_order();
                $('#txt_del_time').val('');
                order.set_delivery_time(false);
            });
            this.$('.js_redeem_loyalty').click(function(){
                var order = self.pos.get_order();
                if(order.getNetTotalTaxIncluded() <= 0){
                    return
                }
                if(order.get_client()){
                    if(self.pos.loyalty_config){
                        if(order.get_client().total_remaining_points > 0){
                            self.click_redeem_loyalty();
                        } else {
                            self.gui.show_popup('error',{
                                title: _t("Loyalty Points"),
                                body: _t(order.get_client().name + " have 0 points to redeem."),
                            })
                        }
                    }else{
                        self.pos.db.notification('danger',"Please configure loyalty configuration.");
                    }
                }else{
                    self.pos.db.notification('danger',"Please select customer.");
                }
            });
            this.$('.js_gift_card').click(function(){
                var order = self.pos.get_order();
                if(order.getNetTotalTaxIncluded() <= 0){
                    return
                }
                var client = order.get_client();
                if(!order.get_giftcard().length > 0 && !order.get_recharge_giftcard().length > 0 ){
                    self.gui.show_popup('redeem_card_popup', {'payment_self': self});
                }
            });
            this.$('.next').click(function(){
                var order = self.pos.get_order();
                if(order){
                    if(customer_display){
                        self.pos.get_order().mirror_image_data(true);
                    }
                }
                if(!self.order_is_valid()){
                    return;
                }
                if (order.get_orderlines().length === 0){
                    return self.pos.db.notification('danger', 'Agregue una línea de Venta!.');
                }

                var payment_amount = 0;
                if (order.get_paymentlines().length === 0){
                    return self.pos.db.notification('danger', 'Agregue un Método de Pago!.');
                }
                _.map(order.get_paymentlines(), function(lines){
                    payment_amount += lines.amount;
                });
                var total = order.getNetTotalTaxIncluded();

                if (payment_amount < total){
                    self.$('.edit').addClass('error');
                    return self.pos.db.notification('danger', 'La cantidad "Entregado" no es correcta!');
                }else{
                    self.$('.edit').removeClass('error');
                }
                if (!order.get_client()){
                    if (self.pos.config.iface_print_auto){
                        if (!self._locked) {
                            return self.pos.get_order().finalize();
                        }
                    } else {
                        return self.gui.show_screen('receipt');
                    }
                }
                else {
                    if (self.pos.config.iface_print_auto){
                        if (!self._locked) {
                            return self.pos.get_order().finalize();
                        }
                    }
                }

                /*
                var cashregister = false;
                for(var i in self.pos.cashregisters){
                    var reg = self.pos.cashregisters[i];
                    if(reg.journal_id[1] === "POS-Crédito (MXN)"){
                        cashregister = reg;
                    }
                }

                if (cashregister){
                    //var order = self.pos.get_order();
                    order.add_paymentline(cashregister);
                    order.selected_paymentline.set_amount(credit_amount,0 );
                    payment.reset_input();
                    payment.render_paymentlines();
                    payment.order_changes();
                }

                 */
            });

            this.$el.find('.paymentmethod-right').click(function(){
                self.click_paymentmethods($(this).data('id'));
            });
        },
        click_numpad: function(button) {
            var self = this;
            var cashregisters = self.pos.cashregisters;
            var paymentlines = this.pos.get_order().get_paymentlines();
            var open_paymentline = false;
            for (var i = 0; i < paymentlines.length; i++) {
                if (! paymentlines[i].paid) {
                    open_paymentline = true;
                }
            }
            if (! open_paymentline) {
                for(var i = 0; i < cashregisters.length; i++){
                    if(!cashregisters[i].journal.jr_use_for){
                        self.pos.get_order().add_paymentline( cashregisters[i]);
                        self.render_paymentlines();
                        break;
                    }
                }
            }
            self._super(button);
        },
    });

    var OrderDetailScreenWidget = screens.ScreenWidget.extend({
        template: 'OrderDetailScreenWidget',
         init: function(parent, options){
            var self = this;
            self._super(parent, options);
        },
        show: function(){
            var self = this;
            self._super();

            var order = self.pos.get_order();
            var params = order.get_screen_data('params');
            var order_id = false;
            if(params){
                order_id = params.order_id;
            }
            if(order_id){
                self.clicked_order = self.pos.db.get_order_by_id(order_id)
            }
            this.renderElement();
            this.$('.back').click(function(){
                self.gui.back();
                if(params.previous){
                    self.pos.get_order().set_screen_data('previous-screen', params.previous);
                    if(params.partner_id){
                        $('.client-list-contents').find('.client-line[data-id="'+ params.partner_id +'"]').click();
                        $('#show_client_history').click();
                    }
                }

            });
            if(self.clicked_order){
                this.$('.pay').click(function(){
                    self.pos.gui.screen_instances.orderlist.pay_order_due(false, order_id)
                });
                var contents = this.$('.order-details-contents');
                contents.append($(QWeb.render('OrderDetails',{widget:this, order:self.clicked_order})));
                var params = {
                    model: 'account.bank.statement.line',
                    method: 'search_read',
                    domain: [['pos_statement_id', '=', order_id]],
                }
                rpc.query(params, {async: false})
//				new Model('account.bank.statement.line').call('search_read',
//				[[['pos_statement_id', '=', order_id]]], {}, {'async': true})
                .then(function(statements){
                    if(statements){
                        self.render_list(statements);
                    }
                });
            }

        },
        render_list: function(statements){
            var contents = $('.paymentline-list-contents');
            contents.html('');
            for(var i = 0, len = Math.min(statements.length,1000); i < len; i++){
                var statement = statements[i];
                var paymentline_html = QWeb.render('PaymentLines',{widget: this, statement:statement});
                var paymentline = document.createElement('tbody');
                paymentline.innerHTML = paymentline_html;
                paymentline = paymentline.childNodes[1];
                contents.append(paymentline);
            }
        },
    });
    gui.define_screen({name:'orderdetail', widget: OrderDetailScreenWidget});

    var InitialBalanceTicket = screens.ReceiptScreenWidget.extend({
        template: 'InitialBalanceTicket',
        willStart: function() {
            var self = this;
            var params = {
                model: 'pos.session',
                method: 'search_read',
                fields: ['id', 'user_id', 'cash_register_balance_start'],
                domain: [['id','=', this.pos.config.current_session_id[0]]],
            };
            return rpc.query(params, {async: false}).then(function(pos_session){
                self.init_receipt_data = {
                        balance_start: pos_session[0]['cash_register_balance_start'],
                        user_name: pos_session[0]['user_id'][1],
                        start_text: _t('Saldo inicial'),
                };
            });
        },
        show: function(){
            var self = this;
            var params = {
                model: 'pos.session',
                method: 'get_datetime_now',
                context: session.user_context,
                domain: [['id','=', this.pos.config.current_session_id[0]]],
            };
            rpc.query(params, {async: false}).then(function(pos_session){
                $('#date_now').html(pos_session['date_now']);
                self._super();
            });
        },
    });

    gui.define_screen({name:'initialBalanceTicket', widget: InitialBalanceTicket});

    var WithdrawMoneyTicket = InitialBalanceTicket.extend({
        template: 'withdrawMoney',
        willStart: function() {
            var self = this;
            var params = {
                model: 'pos.session',
                method: 'search_read',
                fields: ['id', 'user_id', 'cash_register_balance_start'],
                domain: [['id','=', this.pos.config.current_session_id[0]]],
            };
            return rpc.query(params, {async: false}).then(function(pos_session){
                self.init_receipt_data = {
                    user_name: pos_session[0]['user_id'][1],
                };
            });
        },
        show: function(){
            var self = this;
            var params = {
                model: 'pos.session',
                method: 'get_datetime_now',
                context: session.user_context,
                domain: [['id','=', this.pos.config.current_session_id[0]]],
            };
            rpc.query(params, {async: false}).then(function(pos_session){
                $('#withdraw_date_now').html(pos_session['date_now']);
                self._super();
            });
        },
        handle_auto_print: function() {
            var self = this;
            if (self.should_auto_print()) {
                self.print();
            } else {
                self.lock_screen(false);
            }
        },
    });

    gui.define_screen({name:'withdrawMoneyTicket', widget: WithdrawMoneyTicket});

    var EndBalanceTicket = screens.ReceiptScreenWidget.extend({
        template: 'EndBalanceTicket',
        willStart: function() {
            var self = this;
            var params = {
                model: 'pos.session',
                method: 'search_read',
                fields: ['id', 'user_id'],
                domain: [['id','=', self.pos.config.current_session_id[0]]],
            };
            return rpc.query(params, {async: false}).then(function(pos_session){
                self.end_receipt_data = {
                    user_name: pos_session[0]['user_id'][1],
                };
            });
        },
        show: function(){
            self = this;
            var params = {
                model: 'pos.session',
                method: 'get_datetime_now',
                context: session.user_context,
                domain: [['id','=', this.pos.config.current_session_id[0]]],
            };
            rpc.query(params, {async: false}).then(function(pos_session){
                $('#end_date_now').html(pos_session['date_now']);
                self._super();
            });
        },
        should_auto_print: function() {
            return this.pos.config.iface_print_auto;
        },
        handle_auto_print: function() {
            var self = this;
            if (self.should_auto_print()) {
                self.print();
            } else {
                self.lock_screen(false);
            }
        },
    });

    gui.define_screen({name:'endBalanceTicket', widget: EndBalanceTicket});

    screens.OrderWidget.include({
        init: function(parent, options) {
            var self = this;
            this._super(parent,options);
            this.parent = parent;
//            this.line_dblclick_handler = function(event){
//            	var order = self.pos.get_order();
//                var selected_line = order.get_selected_orderline();
//                if(selected_line && selected_line.is_bag){
//                	return;
//                }
//            	self.gui.show_popup('add_note_popup');
//            };
        },
        update_summary: function(){
            var self = this;
            var order = self.pos.get_order();
            if(!order){
                return;
            }
            var total = order ? order.get_total_with_tax() : 0;
            var discount = 0;
            order.set_discount_product_id(false);
            order.set_order_total_discount(discount);
            if(self.pos.config.pos_promotion && self.pos.get_cashier().access_pos_promotion){
                discount = order && !order.get_discount_history() ? order.calculate_discount_amt() : 0;
                order.set_order_total_discount(Number(discount));
            }
            if(this.el.querySelector('.discount .value')){
                this.el.querySelector('.discount .value').textContent = this.format_currency(discount);
            }
            self._super();
            if (!order.get_orderlines().length) {
                $('.cart-num').text(0);
                return;
            }else{
                var qty = 0;
                order.get_orderlines().map(function(line){
                    // get_dummy_product_ids
                    if(($.inArray(line.product.id, order.get_dummy_product_ids()) == -1)){
                        qty += line.get_quantity();
                    }
                });
                qty = Number(qty).toFixed(2)
                $('.cart-num').text(qty);
            }
            if(order.get_client()){
                if(this.pos.loyalty_config && this.pos.loyalty_config.points_based_on == 'product'){
                    var total_points = this.get_points_from_product();
                    if(this.el.querySelector('.loyalty_info_cart .value')){
                        this.el.querySelector('.loyalty_info_cart .value').textContent = this.format_currency(total_points);
                    }
                    order.set_loyalty_earned_point(total_points);
                    order.set_loyalty_earned_amount(order.get_loyalty_amount_by_point(total_points));
                } else if(this.pos.loyalty_config && this.pos.loyalty_config.points_based_on == 'order') {
                    if(order.get_total_with_tax() >=  this.pos.loyalty_config.minimum_purchase
                            && this.pos.loyalty_config.point_calculation > 0){
                        var total_points = this._calculate_loyalty_by_order();
                        if(total_points > 0){
                            if(this.el.querySelector('.loyalty_info_cart .value')){
                                this.el.querySelector('.loyalty_info_cart .value').textContent = this.format_currency(total_points);
                            }
                            order.set_loyalty_earned_point(total_points.toFixed(2));
                            order.set_loyalty_earned_amount(order.get_loyalty_amount_by_point(total_points));
                        }
                    } else if(order.get_total_with_tax() <  this.pos.loyalty_config.minimum_purchase){
                        order.set_loyalty_earned_point(0.00);
                    }
                }
            }
        },
        _calculate_loyalty_by_order: function(){
            var order = this.pos.get_order();
            return (order.get_total_with_tax() * this.pos.loyalty_config.point_calculation) / 100
        },
        get_points_from_product: function(){
            var self = this;
            var order = this.pos.get_order();
            var currentOrderline = order.get_orderlines()
            var total_points = 0.00
            _.each(currentOrderline, function(line){
                var line_points = 0.00;
                if(line.get_product().loyalty_point){
                    line_points = line.get_product().loyalty_point * line.get_quantity();;
                    total_points += line_points;
                } else if(line.get_product().pos_categ_id){
                    var cat_point = self._get_points_from_categ(line.get_product().pos_categ_id[0]);
                    if (cat_point){
                        line_points = cat_point * line.get_quantity();
                        total_points += line_points;
                    }
                }
//				line.set_line_loyalty_point(line_points);
//				line.set_line_loyalty_amount(self.get_loyalty_amount_by_point(line_points));
            });
            return total_points;
        },
        _get_points_from_categ: function(categ_id){
            var category = this.pos.db.get_category_by_id(categ_id);
            if(category && category.loyalty_point){
                return category.loyalty_point;
            } else if(category.parent_id){
                this._get_points_from_categ(category.parent_id[0]);
            }
            return false;
        },
        render_orderline: function(orderline){
            var self = this;
            var el_node = self._super(orderline);
            var el_btn_priority_low = el_node.querySelector('.btn_priority#low');
            var el_btn_priority_medium = el_node.querySelector('.btn_priority#medium');
            var el_btn_priority_high = el_node.querySelector('.btn_priority#high');
            if(el_btn_priority_low){
                el_btn_priority_low.addEventListener('click', (function(event) {
                    orderline.set_kitchen_item_priority('low');
                    self.rerender_orderline(orderline);
                }.bind(self)));
            }
            if(el_btn_priority_medium){
                el_btn_priority_medium.addEventListener('click', (function(event) {
                    orderline.set_kitchen_item_priority('medium');
                    self.rerender_orderline(orderline);
                }.bind(self)));
            }
            if(el_btn_priority_high){
                el_btn_priority_high.addEventListener('click', (function(event) {
                    orderline.set_kitchen_item_priority('high');
                    self.rerender_orderline(orderline);
                }.bind(self)));
            }
//    		if (self.pos.config.enable_product_note && self.pos.get_cashier().access_product_note) {
//    			el_node.addEventListener('dblclick',self.line_dblclick_handler);
//            }
            if(orderline.product.modifier_line.length > 0){
                $('tr.modifiers-row').show();
            }
            var el_remove_icon = el_node.querySelector('.remove_line');
            if(el_remove_icon){
                el_remove_icon.addEventListener('click', (function() {
                    var order = self.pos.get_order();
                    var lines = order.get_orderlines();
                    if(orderline && orderline.get_lock_orderline()){
                        self.pos.db.notification('danger',_t("You can't modify product, because it already started in kitchen."));
                        return true;
                    }
                    if(orderline.get_delivery_charges_flag() && order.get_is_delivery_from_floor()){
                        self.pos.db.notification('danger',_t("You can't remove delivery charge product on delivery mode."));
                        return true;
                    }
                    if(orderline && orderline.get_delivery_charges_flag()){
                        lines.map(function(line){
                            line.set_deliver_info(false);
                        });
                        order.set_is_delivery(false);
                    }
                    order.remove_orderline(orderline);
                    setTimeout(function(){
                        $('tr.modifiers-row').hide();
                        $('.categories').show();
                    }, 100);
                    order.remove_promotion();
                    var customer_display = self.pos.config.customer_display;
                    if(customer_display){
                        self.pos.get_order().mirror_image_data();
                    }
                }.bind(this)));
            }
            var el_combo_icon = el_node.querySelector('.combo-popup-icon');
            if(el_combo_icon){
                el_combo_icon.addEventListener('click',(function(){
                    if(orderline && orderline.get_lock_orderline()){
                        self.pos.db.notification('danger',_t("You can't modify product, because it already started in kitchen."));
                        return;
                    }
                    var product = orderline.get_product();
                    if(product.is_combo && product.product_combo_ids.length > 0 && self.pos.config.enable_combo){
                        self.pos.gui.show_popup('combo_product_popup',{
                            'product':product,
                            'combo_product_info': orderline.get_combo_prod_info()
                        });
                    }
                }.bind(this)));
            }
            if(this.pos.config.edit_combo){
                if(el_node){
                    el_node.addEventListener('click',(function(){
                        if(orderline && orderline.get_lock_orderline()){
                            self.pos.db.notification('danger',_t("You can't modify product, because it already started in kitchen."));
                            return;
                        }
                        var product = orderline.get_product();
                        if(product.is_combo && product.product_combo_ids.length > 0 && self.pos.config.enable_combo){
                            self.pos.gui.show_popup('combo_product_popup',{
                                'product':product,
                                'combo_product_info': orderline.get_combo_prod_info()
                            });
                        }
                    }.bind(this)));
                }
            }
            $(".order-scroller").scrollTop($('.order-scroller .order').height());
            return el_node
        },
        set_value: function(val) {
            var self = this;
            var order = this.pos.get_order();
            var lines = order.get_orderlines();
            this.numpad_state = this.numpad_state;
            var mode = this.numpad_state.get('mode');
            var selected_line = order.get_selected_orderline();
            if (selected_line && selected_line.get_quantity() < 0 && selected_line.attributes.backorder
                    && (val != '' || val != 'remove')) {
                return //Disable numpad for return items except remove
            }
            if(selected_line && mode != "quantity" && selected_line.is_bag){
                return //Disable price and discount for bag product
            }
            if(selected_line && (mode == "quantity" || mode == "discount") && selected_line.get_delivery_charges_flag()){
                return
            }
            if(selected_line && self.pos.config.enable_modifiers && self.pos.get_cashier().access_modifiers){
                if( mode === 'quantity' && val && val != "remove" && order.get_selected_orderline().modifier_line.length > 0){
                    alert("Can not change quantity due to modifiers");
                    return
                }
            }
            if(selected_line && selected_line.get_lock_orderline()){
                self.pos.db.notification('danger',_t("You can't modify product, because it already started in kitchen."));
                return true;
            }
            if(selected_line){
                if(selected_line.get_child_line_id()){
                    var child_line = order.get_orderline(selected_line.get_child_line_id());
                    lines.map(function(line){
                        if(line.get_child_line_id() == selected_line.get_child_line_id()){
                            line.set_child_line_id(false);
                            line.set_is_rule_applied(false);
                        }
                    });
                    if(child_line){
                        selected_line.set_child_line_id(false);
                        selected_line.set_is_rule_applied(false);
                        order.remove_orderline(child_line);
                    }
                    self._super(val);
                }else if(selected_line.get_buy_x_get_dis_y()){
                    self._super(val);
                    if(selected_line.get_quantity() < 1){
                        _.each(lines, function(line){
                            if(line && line.get_buy_x_get_y_child_item()){
//								order.remove_orderline(line);
                                line.set_discount(0);
                                line.set_buy_x_get_y_child_item({});
                                line.set_is_rule_applied(false);
                                line.set_promotion_data(false);
                                self.pos.chrome.screens.products.order_widget.rerender_orderline(line);
                            }
                        });
                    }
                }else if(selected_line.get_quantity_discount()){
                    selected_line.set_quantity_discount({});
                    selected_line.set_discount(0);
                    selected_line.set_promotion_data(false);
                    selected_line.set_is_rule_applied(false);
                    self._super(val);
                }else if(selected_line.get_discount_amt()){
                    selected_line.set_discount_amt_rule(false);
                    selected_line.set_discount_amt(0);
                    selected_line.set_promotion_data(false);
                    selected_line.set_unit_price(selected_line.product.price);
                    selected_line.set_is_rule_applied(false);
                    self._super(val);
                }
                else if(selected_line.get_multi_prods_line_id()){
                    var multi_prod_id = selected_line.get_multi_prods_line_id() || false;
                    if(multi_prod_id){
                        _.each(lines, function(_line){
                            if(_line && _line.get_multi_prods_line_id() == multi_prod_id){
                                _line.set_discount(0);
                                _line.set_is_rule_applied(false);
                                _line.set_promotion_data(false);
                                _line.set_combinational_product_rule(false);
                                self.pos.chrome.screens.products.order_widget.rerender_orderline(_line);
                            }
                        });
                    }
                    self._super(val);
                }else if(selected_line.get_multi_prod_categ_rule()){
                    selected_line.set_discount(0);
                    selected_line.set_is_rule_applied(false);
                    selected_line.set_multi_prod_categ_rule(false);
                    self._super(val);
                }
                else{
                    if(!selected_line.get_promotion()){
                        self._super(val);
                    }
                }
            }
            setTimeout(function(){
                order.apply_promotion();
            }, 1000);
        },
        renderElement: function() {
            this._super();
            var self = this;
//    		$('#total_pay').click(function(){
//    			var order = self.pos.get_order();
//                var has_valid_product_lot = _.every(order.orderlines.models, function(line){
//                    return line.has_valid_product_lot();
//                });
//                if(!has_valid_product_lot){
//                    self.gui.show_popup('confirm',{
//                        'title': _t('Empty Serial/Lot Number'),
//                        'body':  _t('One or more product(s) required serial/lot number. Please Enter Serial/Lot Number'),
//                        'hide_confirm': false,
//                        confirm: function(){
//                            self.gui.show_screen('payment');
//                        },
//                    });
//                }else{
//                    self.gui.show_screen('payment');
//                }
//    		});
        },
        click_line: function(orderline, event) {
            this._super(orderline, event);
            if(orderline.get_deliver_info()){
                $('#delivery_mode').addClass('deliver_on')
            } else {
                $('#delivery_mode').removeClass('deliver_on')
            }
            if(this.parent.modifier_widget){
                if(orderline.get_product() && orderline.get_product().modifier_line.length > 0){
                    this.parent.modifier_widget.show_modifiers(orderline.get_product());
                } else {
                    this.parent.modifier_widget.hide_modifiers();
                }
            }
            if(orderline && orderline.get_take_away()){
                $('div#take_away').addClass('selected-menu');
            } else {
                $('div#take_away').removeClass('selected-menu');
            }
            if(orderline && orderline.get_drive_through_mode()){
                $('div#drive_through_mode').addClass('selected-menu');
            } else {
                $('div#drive_through_mode').removeClass('selected-menu');
            }
            if(orderline && orderline.get_dine_in_mode()){
                $('div#dine_in_mode').addClass('selected-menu');
            } else {
                $('div#dine_in_mode').removeClass('selected-menu');
            }
            if(orderline && orderline.get_online_mode()){
                $('div#online_mode').addClass('selected-menu');
            } else {
                $('div#online_mode').removeClass('selected-menu');
            }
        },
    });

    screens.ProductScreenWidget.include({
        set_back_to_parent_categ: function(id){
            var self = this;
            var products = self.pos.chrome.screens.products;
            if(id){
                var parent_categ = self.pos.db.get_category_by_id(id);
                var parent_categ_id = false;
                if(parent_categ && parent_categ.parent_id[0]){
                    parent_categ_id = parent_categ.parent_id[0];
                }else{
                    if(self.old_categ_id == id){
                        self.parent_categ_id = self.pos.db.root_category_id;
                        id = self.pos.db.root_category_id;
                        products.product_categories_widget.set_category(self.pos.db.get_category_by_id(id));
                        products.product_categories_widget.renderElement();
                    }else{
                        self.parent_categ_id = id;
                        products.product_categories_widget.set_category(self.pos.db.get_category_by_id(id));
                    }
                }
                self.old_categ_id = id;
                var sub_categories = products.product_categories_widget.subcategories;
                self.render_product_category(sub_categories);
            }
        },
        start: function(){
            var self = this;
            self._super();
            self.parent_categ_id = false;
            self.old_categ_id = 0;
            self.custom_switch_category_handler = function(event){
                var id = $(event.target).attr('data-category-id') || 0;
                var root_categ_id = self.pos.db.get_category_by_id(self.pos.db.root_category_id);
                self.pos.chrome.screens.products.product_categories_widget.set_category(self.pos.db.get_category_by_id(id));
                self.pos.chrome.screens.products.product_categories_widget.renderElement();
                var products = self.pos.chrome.screens.products;
                var sub_categories = products.product_categories_widget.subcategories;
                if(id == 0){
                    self.parent_categ_id = false;
//			        self.pos.chrome.screens.products.product_categories_widget.renderElement();
                    var products = self.pos.db.get_product_by_category(id);
                    self.pos.chrome.screens.products.product_list_widget.set_product_list(products);
                    self.render_product_category(sub_categories);
                    return true;
                }else{
                    $('.category-simple-button').removeClass('menu-selected');
                    $(event.currentTarget).addClass('menu-selected');
                }
                self.categ_id = self.pos.db.get_category_by_id(id);
                if(self.categ_id.child_id && self.categ_id.child_id.length > 0){
                    self.render_product_category(sub_categories)
                }
                self.set_back_to_parent_categ(id);
            };
//            $('#product-category-slider').click(function(){
//                self.call_sidebar();
//            });
            $('#slidemenubtn1').click(function(){
                self.call_sidebar();
            });
            if(self.pos.config.enable_modifiers && self.pos.get_cashier().access_modifiers){
                self.modifier_widget = new ModifierWidget(this);
                self.modifier_widget.replace(this.$('.placeholder-ModifierWidget'));
            }
            self.namelist = [];
            _.each(self.pos.db.get_product_namelist(),function(list){
                if(list[0] !== self.pos.config.delivery_product_id[0]){
                    self.namelist.push(list[1]);
                }
            });
            $('.searchbox input').autocomplete({
                source:self.namelist,
            });
//			$('#total_pay').click(function(){
//	        	self.gui.show_screen('payment');
//    		});
            $('span.set_customer').click(function(){
                self.gui.show_screen('clientlist');
            });
            $('div#sale_mode').click(function(){
                var order = self.pos.get_order();
                order.change_mode("sale",this);
            });
            $('div#drive_through_mode').click(function(){
                var order = self.pos.get_order();
//	        	order.set_resturant_mode("drive_through_mode",this);
                if($(this).hasClass('selected-menu')) {
                    $(this).removeClass('selected-menu');
                } else {
                    $(this).addClass('selected-menu');
                }
                var lines = order.get_orderlines();
                var orderLines = [];
                for(var i=0;i<lines.length;i++){
                    orderLines.push(lines[i]);;
                }
                if (orderLines.length != 0) {
                    var selected_line = order.get_selected_orderline();
                    if (selected_line) {
                        if(selected_line.get_drive_through_mode()){
                            selected_line.set_drive_through_mode(false);
                            if(selected_line.modifier_line && selected_line.modifier_line.length > 0){
                                var modifier_list = selected_line.modifier_line;
                                _.each(modifier_list, function(mod_line){
                                    mod_line['drive_through_mode'] = false;
                                });
                            }
                        } else {
                            selected_line.set_drive_through_mode(true);
                            if(selected_line.modifier_line && selected_line.modifier_line.length > 0){
                                var modifier_list = selected_line.modifier_line;
                                _.each(modifier_list, function(mod_line){
                                    mod_line['drive_through'] = true;
                                    mod_line['dine_in_mode'] = false;
                                    mod_line['online_mode'] = false;
                                    mod_line['is_take_away'] = false;
                                })
                            }
                        }
                    }
                }
            });
            $('div#dine_in_mode').click(function(){
                var order = self.pos.get_order();
                if($(this).hasClass('selected-menu')) {
                    $(this).removeClass('selected-menu');
                } else {
                    $(this).addClass('selected-menu');
                }
                var lines = order.get_orderlines();
                var orderLines = [];
                for(var i=0;i<lines.length;i++){
                    orderLines.push(lines[i]);;
                }
                if (orderLines.length != 0) {
                    var selected_line = order.get_selected_orderline();
                    if (selected_line) {
                        if(selected_line.get_dine_in_mode()){
                            selected_line.set_dine_in_mode(false);
                            if(selected_line.modifier_line && selected_line.modifier_line.length > 0){
                                var modifier_list = selected_line.modifier_line;
                                _.each(modifier_list, function(mod_line){
                                    mod_line['dine_in_mode'] = false;
                                });
                            }
                        } else {
                            selected_line.set_dine_in_mode(true);
                            if(selected_line.modifier_line && selected_line.modifier_line.length > 0){
                                var modifier_list = selected_line.modifier_line;
                                _.each(modifier_list, function(mod_line){
                                    mod_line['dine_in_mode'] = true;
                                    mod_line['drive_through'] = false;
                                    mod_line['online_mode'] = false;
                                    mod_line['is_take_away'] = false;
                                });
                            }
                        }
                    }
                }
//	        	order.set_resturant_mode("dine_in_mode",this);
            });
            $('div#online_mode').click(function(){
                var order = self.pos.get_order();
                if($(this).hasClass('selected-menu')) {
                    $(this).removeClass('selected-menu');
                } else {
                    $(this).addClass('selected-menu');
                }
                var lines = order.get_orderlines();
                var orderLines = [];
                for(var i=0;i<lines.length;i++){
                    orderLines.push(lines[i]);;
                }
                if (orderLines.length != 0) {
                    var selected_line = order.get_selected_orderline();
                    if (selected_line) {
                        if(selected_line.get_online_mode()){
                            selected_line.set_online_mode(false);
                            if(selected_line.modifier_line && selected_line.modifier_line.length > 0){
                                var modifier_list = selected_line.modifier_line;
                                _.each(modifier_list, function(mod_line){
                                    mod_line['online_mode'] = false;
                                });
                            }
                        } else {
                            selected_line.set_online_mode(true);
                            if(selected_line.modifier_line && selected_line.modifier_line.length > 0){
                                var modifier_list = selected_line.modifier_line;
                                _.each(modifier_list, function(mod_line){
                                    mod_line['online_mode'] = true;
                                    mod_line['dine_in_mode'] = false;
                                    mod_line['drive_through'] = false;
                                    mod_line['is_take_away'] = false;
                                });
                            }
                        }
                    }
                }
            });
            $('div#take_away').click(function(){
                var order = self.pos.get_order();
                if(order.get_is_takeaway_from_floor()){
                    return true;
                }
                if($(this).hasClass('selected-menu')) {
                    $(this).removeClass('selected-menu');
                } else {
                    $(this).addClass('selected-menu');
                }
                var lines = order.get_orderlines();
                var orderLines = [];
                for(var i=0;i<lines.length;i++){
                    orderLines.push(lines[i]);;
                }
                if (orderLines.length != 0) {
                    if (order.get_selected_orderline()) {
                        if(order.get_selected_orderline().get_take_away()){
                            order.get_selected_orderline().set_take_away(false);
                        } else {
                            order.get_selected_orderline().set_take_away(true);
                        }
                    }
                }
            });
            $('div#merge_table').click(function(event){
                var table = self.pos.table;
                if(table){
                    self.gui.show_popup('merge_table_popup');
                }else{
                    return self.pos.gui.show_popup('flexi_alert',{
                        'title':_t('No Table'),
                        'body':_t("Current order have no any table selected to merge with another tables."),
                    });
                }
            });
            $('div#order_return').click(function(){
                if(self.pos.config.return_authentication_user_ids && self.pos.config.return_authentication_user_ids.length > 0){
                    var users_pass = [];
                    _.each(self.pos.users, function(user){
                        self.pos.config.return_authentication_user_ids.map(function(user_id){
                            if(user_id == user.id){
                                if(user.pos_security_pin){
                                    users_pass.push(user.pos_security_pin);
                                }
                            }
                        })
                    });
                    if(users_pass && users_pass.length > 0){
                        self.ask_password(users_pass).then(function(){
                            self.gui.show_popup('PosReturnOrderOption');
                        });
                    }else{
                        self.pos.db.notification('danger',_t('Authentications users passwords not found!'));
                    }
                }
            });
            $('div#order_screen').click(function(){
                self.gui.show_screen('orderlist');
            });
            $('div#bag_charges').click(function(){
                var order = self.pos.get_order();
                if(order && order.is_empty()){
                    $('div.order-empty').animate({
                        color: '#FFCCCC',
                    }, 1000, 'linear', function() {
                          $(this).css('color','#DDD');
                    });
                    return
                }
                if(order && order.get_ret_o_id()){
                    self.pos.db.notification('danger',_t('Sorry, This operation not allow to add bag!'));
                    return
                }
                self.gui.show_popup('bags_popup');
            });
            $('div#send_order_kitchen').click(function(){
                self.send_to_kitchen();
            });
//	        $('div#draft_order').click(function(){
//	        	var order = self.pos.get_order();
//	        	if(order.is_empty()){
//	        		$('div.order-empty').animate({
//	            	    color: '#FFCCCC',
//	            	}, 1000, 'linear', function() {
//	            	      $(this).css('color','#DDD');
//	            	});
//	        		return
//	        	}
//	        	if(order.get_ret_o_id()){
//	        		self.pos.db.notification('danger',_t('Sorry, This operation not allow to create draft order!'));
//	        		return
//	        	}
//	        	order.initialize_validation_date();
//	            var currentOrderLines = order.get_orderlines();
//	            var orderLines = [];
//	            _.each(currentOrderLines,function(item) {
//	                return orderLines.push(item.export_as_JSON());
//	            });
//	            if(self.pos.config.enable_order_reservation && self.pos.config.allow_reservation_with_no_amount){
//	            	var credit = order.get_total_with_tax() - order.get_total_paid();
//	         		var client = order.get_client();
//	            	if (client && credit > client.remaining_credit_limit){
//	         			self.gui.show_popup('max_limit',{
//	         				remaining_credit_limit: client.remaining_credit_limit,
//	                        draft_order: true,
//	                    });
//	                    return
//	         	    } else {
//	         	    	self.pos.push_order(order);
//	                    self.gui.show_screen('receipt');
//	                }
//	            } else {
//	            	self.gui.show_popup('confirm',{
//		                'title': _t('Order Quotation'),
//		                'body': _t('Do you want to create order as quotation?'),
//		                confirm: function(){
//		                	self.pos.push_order(order);
//		                	self.gui.show_screen('receipt');
//		                },
//		            });
//	            }
//	        });
            $('div#product_qty').click(function(){
                var order = self.pos.get_order();
                var lines = order.get_orderlines();
                var orderLines = [];
                var length = order.orderlines.length;
                if(lines.length <= 0){
                    $('div.order-empty').animate({
                        color: '#FFCCCC',
                    }, 1000, 'linear', function() {
                          $(this).css('color','#DDD');
                    });
                }
                if(order.get_selected_orderline()){
                    var prod = order.get_selected_orderline().get_product();
                    var prod_info = [];
                    var total_qty = 0;
                    var params = {
                        model: 'stock.warehouse',
                        method: 'disp_prod_stock',
                        args: [prod.id,self.pos.shop.id],
                    }
                    rpc.query(params, {async: false}).then(function(result){
                        if(result){
                            prod_info = result[0];
                            total_qty = result[1];
                            var prod_info_data = "";
                            _.each(prod_info, function (i) {
                                prod_info_data += "<tr>"+
                                "	<td style='color:gray;font-weight: initial !important;padding:5px;text-align: left;padding-left: 15px;'>"+i[0]+"</td>"+
                                "	<td style='color:gray;font-weight: initial !important;padding:5px;text-align: right;padding-right: 15px;'>"+i[1]+"</td>"+
                                "</tr>"
                            });
                            self.gui.show_popup('product_qty_popup',{prod_info_data:prod_info_data,total_qty: total_qty});
                        }
                    }).fail(function(){
                        self.pos.db.notification('danger',"Connection lost");
                    });
                }
            });
            $('.empty-cart').click(function(){
                var order = self.pos.get_order();
                var lines = order.get_orderlines();
                if(lines.length > 0){
                    self.gui.show_popup('confirm',{
                        'title': _t('Empty Cart ?'),
                        'body': _t('You will lose all items associated with the current order'),
                        confirm: function(){
                            order.empty_cart();
                            order.mirror_image_data();
                        },
                    });
                } else {
                    $('div.order-empty').animate({
                        color: '#FFCCCC',
                    }, 1000, 'linear', function() {
                          $(this).css('color','#DDD');
                    });
                }
            });
//	    	$('#stock-location').click(function(){
//	    		var locations = self.pos.location_ids;
//	    		if(locations && locations.length > 1){
//    				self.gui.show_popup('cashier_locations_popup',{'cashier_locations':locations});
//    			} else {
//    				self.pos.db.notification('warning',_t('You have no any location for switch'));
//    			}
//	    	});
            $('#delivery_mode').click(function(){
                var order = self.pos.get_order();
                if(order.get_is_delivery_from_floor()){
                    return true;
                }
                var lines = order.get_orderlines();
                var line = order.get_selected_orderline();
                var selected_orderline = (line && line.get_quantity() > 0 && order.is_sale_product(line.product)) ? line : false;
                if(order.get_ret_o_id()){
                    self.pos.db.notification('danger',_t('Sorry, This operation not allow to use delivery operation!'));
                    return
                }
                if($('#delivery_mode').hasClass('deliver_on')){
                    if(lines.length > 0){
                        self.gui.show_popup('confirm',{
                            'title': _t('Delivery Order?'),
                            'body':  _t('Are you sure you want to remove delivery order?'),
                            confirm: function(){
//                            	order.clear_cart();
                                order.set_is_delivery(false);
                                lines.map(function(line){
                                    line.set_deliver_info(false);
                                    if(line.get_delivery_charges_flag()){
                                        order.remove_orderline(line);
                                    }
                                });
                                $('#delivery_mode').removeClass('deliver_on');
                            },
                        });
//		    			var r = confirm("You want to remove delivery order?");
//		    			if(r){
//		    				order.clear_cart();
//		    				$('#delivery_mode').removeClass('deliver_on');
//		    			}
                    }
                }else{
                    if(lines.length > 0){
//		    			var r = confirm("You want to make delivery order?");
                        self.gui.show_popup('confirm',{
                            'title': _t('Delivery Order?'),
                            'body':  _t('You want to make delivery order?'),
                            confirm: function(){
                                self.confirm_delivery_order();
                            },
                        });
//		    			if(r){
//		    				if(!order.get_is_delivery()){
//		    					var deliver_product_id = self.pos.config.delivery_product_id[0];
//					    		var deliver_amt = self.pos.config.delivery_amount;
//					    		var product = self.pos.db.get_product_by_id(deliver_product_id);
//				    			if(product){
//				    				var line_deliver_charges = new models.Orderline({}, {pos: self.pos, order:order, product: product});
//					        		line_deliver_charges.set_quantity(1);
//					        		line_deliver_charges.set_unit_price(deliver_amt || 0);
//					        		line_deliver_charges.set_delivery_charges_color(true);
//					        		line_deliver_charges.set_delivery_charges_flag(true);
//					        		line_deliver_charges.state = 'done';
//					                order.add_orderline(line_deliver_charges);
//					                order.set_is_delivery(true);
//					                lines.map(function(line){
//					                	line.set_deliver_info(true);
//					                });
//					                order.set_delivery(true);
//				    				$('#delivery_mode').addClass('deliver_on');
//				    			}
//				    		}
//		    			}
                    }
                }
//		    	if(selected_orderline && lines.length > 0){
//			    	if(selected_orderline && !$('#delivery_mode').hasClass('deliver_on')){
//			    		if(!selected_orderline.get_delivery_charges_flag()){
//			    			selected_orderline.set_deliver_info(true);
//			    		}else{
//			    			$('#delivery_mode').removeClass('deliver_on');
//			    		}
//			    		var deliver_product_id = self.pos.config.delivery_product_id[0];
//			    		var deliver_amt = self.pos.config.delivery_amount;
//			    		var product = self.pos.db.get_product_by_id(deliver_product_id);
//			    		if(!order.get_is_delivery()){
//			    			if(product){
//			    				var line_deliver_charges = new models.Orderline({}, {pos: self.pos, order:order, product: product});
//				        		line_deliver_charges.set_quantity(1);
//				        		line_deliver_charges.set_unit_price(deliver_amt || 0);
//				        		line_deliver_charges.set_delivery_charges_color(true);
//				        		line_deliver_charges.set_delivery_charges_flag(true);
//				        		line_deliver_charges.state = 'done';
//				                order.add_orderline(line_deliver_charges);
//				                order.set_is_delivery(true);
//			    			}
//			    		}
//		                order.set_delivery(true);
//		                $('#delivery_mode').addClass('deliver_on');
//			    	}else if(selected_orderline && selected_orderline.get_deliver_info()){
//			    		selected_orderline.set_deliver_info(false);
//			    		order.count_to_be_deliver();
//			    		$('#delivery_mode').removeClass('deliver_on');
//			    	}else if(selected_orderline && !selected_orderline.get_deliver_info()){
//			    		if(!selected_orderline.get_delivery_charges_flag()){
//			    			selected_orderline.set_deliver_info(true);
//			    		}else{
//			    			$('#delivery_mode').removeClass('deliver_on');
//			    		}
//			    	}else{
//			    		$('#delivery_mode').removeClass('deliver_on');
//			    		selected_orderline.set_deliver_info(false);
//			    		order.count_to_be_deliver();
//			    	}
//		    	}else if(order.get_is_delivery()){
//		    		order.count_to_be_deliver();
//		    	}else{
//		    		//enable mode
//		    		$('#delivery_mode').addClass('deliver_on');
//		    		var deliver_product_id = self.pos.config.delivery_product_id[0];
//		    		var deliver_amt = self.pos.config.delivery_amount;
//		    		var product = self.pos.db.get_product_by_id(deliver_product_id);
//		    		if(!order.get_is_delivery()){
//		    			if(product){
//		    				var line_deliver_charges = new models.Orderline({}, {pos: self.pos, order:order, product: product});
//			        		line_deliver_charges.set_quantity(1);
//			        		line_deliver_charges.set_unit_price(deliver_amt || 0);
//			        		line_deliver_charges.set_delivery_charges_color(true);
//			        		line_deliver_charges.set_delivery_charges_flag(true);
//			        		line_deliver_charges.state = 'done';
//			                order.add_orderline(line_deliver_charges);
//			                order.set_is_delivery(true);
//		    			}
//		    		}
//	                order.set_delivery(true);
//		    	}
            });
            $('#money_in').click(function(){
                if(self.pos.config.cash_control){
                    var is_cashdrawer = false;
                    var msg_show_put_money_in = "";
                    msg_show_put_money_in += "<div class='container'>" +
                                                "<div class='sub-container'>" +
                                                    "<table id='tbl_id'>" +
                                                        "<tr>" +
                                                            "<td>Razón</td>" +
                                                            "<td id='td_id'><input id='txt_reason_in_id' type='text' name='txt_reason_in'></td>" +
                                                        "</tr>" +
                                                        "<tr>" +
                                                            "<td>Importe</td>" +
                                                            "<td id='td_id'><input id='txt_amount_in_id' type='text' name='txt_amount_in'></td>" +
                                                        "<tr>" +
                                                    "</table>" +
                                                "</div>" +
                                            "</div>";
                    self.gui.show_popup('put_money_in',{msg_show_put_money_in:msg_show_put_money_in});
                }else{
                    self.pos.db.notification('danger',_t('Please enable cash control from pos configuration.'));
                }
            });
            $('#money_out').click(function(){
                if(self.pos.config.authentication_user_ids && self.pos.config.authentication_user_ids.length > 0){
                    var users_pass = [];
                    _.each(self.pos.users, function(user){
                        self.pos.config.authentication_user_ids.map(function(user_id){
                            if(user.id == user_id){
                                if(user.pos_security_pin){
                                    users_pass.push(user.pos_security_pin);
                                }
                            }
                        });
                    });
                    if(users_pass && users_pass.length > 0){
                        self.ask_password(users_pass).then(function(){
                            if(self.pos.config.cash_control)
                            {
                                if (self.pos.config.iface_print_auto) {
                                    self.gui.show_screen('withdrawMoneyTicket');
                                }
                                setTimeout(function() {
                                    self.gui.show_screen('products');
                                    var msg_show_take_money_out = "<div class='container'>" +
                                        "<div class='sub-container'>" +
                                            "<table id='tbl_id'>" +
                                                "<tr>" +
                                                    "<td>Razón</td>" +
                                                    "<td id='td_id'><input id='txt_reason_out_id' type='text' name='txt_reason_in'></td>" +
                                                "</tr>" +
                                                "<tr>" +
                                                    "<td>Importe</td>" +
                                                    "<td id='td_id'><input id='txt_amount_out_id' type='text' name='txt_amount_in'></td>" +
                                                "<tr>" +
                                            "</table>" +
                                        "</div>" +
                                    "</div>";
                                    self.gui.show_popup('take_money_out',{msg_show_take_money_out:msg_show_take_money_out});
                                }, 1000);
                            }else{
                                self.pos.db.notification('danger',_t('Please enable cash control from pos configuration.'));
                            }
                        });
                    }else{
                        self.pos.db.notification('danger',_t('Authentications users passwords not found!'));
                    }
                } else{
                    self.pos.db.notification('danger',_t('POS Manager not found for authentication.'));
                }
            });

            $('#add_credit').click(function(){
                var customer = self.pos.get_order().get_client()
                if(customer){
                    self.gui.show_popup('AddMoneyToCreditPopup', {new_client: customer});
                }else{
                    self.gui.show_screen('clientlist');
                }
            });

            $('#pay_debit').click(function(){
                var customer = self.pos.get_order().get_client()
                if(customer){
                    self.gui.show_popup('pay_debit_popup');
                }else{
                    self.gui.show_screen('clientlist', {'skip_pay_debit': true});
                }
            });

            $('#pay_meal_plan').click(function(){
                var customer = self.pos.get_order().get_client()
                if(customer){
                    self.gui.show_popup('pay_meal_plan_popup');
                }else{
                    self.gui.show_screen('clientlist');
                }
            });
            $('#change_pin').click(function(){
                var customer = self.pos.get_order().get_client();
                if (customer){
                    self.gui.show_popup('update_pip_popup');
                }else{
                    self.gui.show_screen('clientlist', {change_pin: true});
                }
            });
        },
        confirm_delivery_order: function(){
            var self = this;
            var order = self.pos.get_order();
            var lines = order.get_orderlines();
            if(!order.get_is_delivery()){
                var deliver_product_id = self.pos.config.delivery_product_id[0];
                var deliver_amt = self.pos.config.delivery_amount;
                var product = self.pos.db.get_product_by_id(deliver_product_id);
                if(product){
                    var line_deliver_charges = new models.Orderline({}, {pos: self.pos, order:order, product: product});
                    line_deliver_charges.set_quantity(1);
                    line_deliver_charges.set_unit_price(deliver_amt || 0);
                    line_deliver_charges.set_delivery_charges_color(true);
                    line_deliver_charges.set_delivery_charges_flag(true);
                    line_deliver_charges.set_delivery_product_id(deliver_product_id);
                    line_deliver_charges.state = 'done';
                    order.add_orderline(line_deliver_charges);
                    order.set_is_delivery(true);
                    lines.map(function(line){
                        line.set_deliver_info(true);
                    });
                    order.set_delivery(true);
                    $('#delivery_mode').addClass('deliver_on');
                }
            }
        },
        send_to_kitchen: function(){
            var self = this;
            var order = self.pos.get_order();
            if(order.is_empty()){
                $('div.order-empty').animate({
                    color: '#FFCCCC',
                }, 1000, 'linear', function() {
                      $(this).css('color','#DDD');
                });
                return;
            }
            order.initialize_validation_date();
            var currentOrderLines = order.get_orderlines();
            var orderLines = [];
            _.each(currentOrderLines,function(item) {
                return orderLines.push(item.export_as_JSON());
            });
            if(order.hasChangesToPrint()){
                order.printChanges();
                order.saveChanges();
            }
            self.pos.push_order(order).then(function(){
                order.set_is_update_increnement_number(true);
                order.set_temp_increment_number(self.pos.increment_number);
                var params = {
                    model: 'pos.order',
                    method: 'search_read',
                    fields: ['id'],
                    domain: [['pos_reference','=',self.pos.get_order().get_name()]],
                }
                rpc.query(params, {async: false}).then(function(pos_order){
                    if(pos_order && pos_order[0]){
                        order.set_order_id(pos_order[0].id);
                        order.set_pos_reference(self.pos.get_order().get_name());
                    }
                });
            });
        },
        ask_password: function(password) {
            var self = this;
            var ret = new $.Deferred();
            if (password) {
                this.gui.show_popup('password',{
                    'title': _t('Password ?'),
                    confirm: function(pw) {
                        var flag = false;
                        for (var i = 0; i < password.length; i++){
                            if(password[i] == pw) {
                                flag = true;
                            }
                        }
                        if(flag){
                            if (self.pos.config.iface_cashdrawer) {
                                self.pos.proxy.open_cashbox();
                            }
                            self.gui.show_screen('endBalanceTicket');
                            setTimeout(function () {
                                ret.resolve();
                            }, 1000);
                        } else{
                            self.gui.show_popup('error_popup',{
                                'title':_t('Contraseña incorrecta.'),
                                'body':_('La contraseña no es correcta.')
                            });
                        }
                    },
                    cancel: function() {
                        if(self.gui.current_screen && self.gui.current_screen.order_widget &&
                        self.gui.current_screen.order_widget.numpad_state){
                            self.gui.current_screen.order_widget.numpad_state.reset();
                        }
                    }
                });
            } else {
                ret.resolve();
            }
            return ret;
        },
        show: function(){
            this._super();
            var self = this;
            $('#slidemenubtn').show();
            $('#slidemenubtn1').css({'right':'0px'});
            $('.product-list-container').css('width','100%');
            $('#wrapper1').addClass('toggled');
            var order = this.pos.get_order();
            var pos_type = self.pos.config.pos_type;
            if(pos_type){
                if(pos_type == "drive_through_mode"){
//       	 			$("div#drive_through_mode").trigger('click');
                    $("div#drive_through_mode").addClass('selected-menu');
                    $("div#dine_in_mode").removeClass('selected-menu');
                    $("div#online_mode").removeClass('selected-menu');
                    $("div#take_away").removeClass('selected-menu');
//       	 			this.set_drive_through_mode(true);
                } else if(pos_type == "dine_in_mode"){
//       	 			$("div#dine_in_mode").trigger('click');
                    $("div#dine_in_mode").addClass('selected-menu');
                    $("div#drive_through_mode").removeClass('selected-menu');
                    $("div#online_mode").removeClass('selected-menu');
                    $("div#take_away").removeClass('selected-menu');
//       	 			this.set_dine_in_mode(true);
                } else if(pos_type == "online_mode"){
//   	 				$("div#online_mode").trigger('click');
                    $("div#online_mode").addClass('selected-menu');
                    $("div#dine_in_mode").removeClass('selected-menu');
                    $("div#drive_through_mode").removeClass('selected-menu');
                    $("div#take_away").removeClass('selected-menu');
//       	 			this.set_online_mode(true);
                } else if(pos_type == "take_away"){
                    $("div#take_away").addClass('selected-menu');
                    $("div#online_mode").removeClass('selected-menu');
                    $("div#dine_in_mode").removeClass('selected-menu');
                    $("div#drive_through_mode").removeClass('selected-menu');
                }
            }
            var partner = self.pos.config.default_partner_id;
            

            if(!order.get_client()){
                if(partner){
                    var set_partner = self.pos.db.get_partner_by_id(partner[0])
                    if(set_partner){
                        order.set_client(set_partner);
                    }
                } else if(self.pos && self.pos.get_order()){
                    order.set_client(null);
                }
            }
            if(order && order.get_merge_table_ids() && order.get_merge_table_ids()[0]){
                var merged_tables = [];
                order.get_merge_table_ids().map(function(id){
                    if(self.pos.table.id != id){
                        var table_name = self.pos.tables_by_id[id];
                        if(table_name && table_name.name){
                            merged_tables.push(table_name);
                            table_name.parent_linked_table = self.pos.table;
                        }
                    }
                });
                $('span.orders.touch-scrollable .floor-button').replaceWith(QWeb.render('BackToFloorButton',{table: self.pos.table, floor:self.pos.table.floor,merged_tables:merged_tables}));
                $('span.orders.touch-scrollable .floor-button').click(function(){
                    self.pos.chrome.widget.order_selector.floor_button_click_handler();
                });
            }
            order.set_is_categ_sideber_open(false)
            var img_src = "<i style='font-size: 50px;' class='fa fa-user' aria-hidden='true'></i>";
            var user_nm = "Guest Customer";
            if(order && order.get_client()){
                img_src = "<img style='height:50px;width:50px' src='"+this.partner_icon_url(order.get_client().id)+"'/>";
                user_nm = order.get_client().name;
            }
            $('span.avatar-img').html(img_src);
            $('span.c-user').html(user_nm);
            $('.show-left-cart').hide();
            $('.searchbox input').val('');
            $('.category_searchbox input').val('');
            if(self.pos.config.enable_rounding && self.pos.config.auto_rounding){
                order.set_rounding_status(true);
            }else{
                order.set_rounding_status(false);
            }
           
//    		var products = self.pos.chrome.screens.products;
//            var sub_categories = products.product_categories_widget.subcategories;
            var sub_categories = [];
            var categ_list = self.pos.db.get_category_search_list() || [];
            categ_list.map(function(category){
                var categ = self.pos.db.get_category_by_id(category.id);
                if(categ && !categ.parent_id){
                    sub_categories.push(categ);
                }
            });
            if(self.pos.config.vertical_categories && !self.pos.config.iface_start_categ_id.length > 0) {
                self.render_product_category(sub_categories);
//                $('.searchbox input').keypress(function(event){
//                    var search_value = $('.search').val();
//                    var search_timeout = null;
//                    if(event.type == "keypress" || event.keyCode === 46 || event.keyCode === 8){
//                        clearTimeout(search_timeout);
//                        var categ = self.pos.chrome.screens.products.product_categories_widget.category;
//                        var searchbox = this;
//                        search_timeout = setTimeout(function(){
//                            self.pos.chrome.screens.products.product_categories_widget.perform_search(categ, searchbox.value, event.which === 13);
//                        },0);
//                    }
//                    self.pos.chrome.screens.products.product_categories_widget.renderElement();
//                });
//                $('.search-clear').click(function(){
//                    self.pos.chrome.screens.products.product_categories_widget.clear_search();
//                    $('.searchbox input').val('');
//                    $('.searchbox input').focus();
//                });
            }else{
                $('.rightpane').width('auto');
            }
            if (order.get_client()){
                var params = {
                    model: 'res.partner',
                    fields: ['product_ids'],
                    method: 'search_read',
                    domain: [['id', '=', order.get_client().id]]
                }
                return rpc.query(params).then(function(results){
                    if (results){       
                        //order.add_product(results[0].product_ids);
                        //self.product_list_widget.set_product_list(results[0].product_ids[0]);
                        //debugger;
                        //var product_ids = self.pos.db.get_product_by_id();
                        //product_list_widget.set_product_list(product_ids);
                    }
                });
            }
        },
        call_sidebar: function(){
            var self = this;
            var order = self.pos.get_order();
            $('#wrapper1').removeClass('oe_hidden');
            $('#wrapper1').toggleClass("toggled");
            $('#wrapper1').find('#menu-toggle1 i').toggleClass('fa fa-chevron-left fa fa-chevron-right');
            if(!$('#wrapper1').hasClass('toggled')){
                $('.product-list-container').css({
                    'width':'calc(100% - 150px)',
                    '-webkit-transition': 'width .5s',
                });
                $('#slidemenubtn1').css({
                    'right':'150px',
                });
                if(order){
                    order.set_is_categ_sideber_open(true);
                }
            }else{
                $('.product-list-container').css({
                    'width':'100%',
                    '-webkit-transition': 'width .5s',
                });
                $('#slidemenubtn1').css({
                    'right':'0px',
                });
                if(order){
                    order.set_is_categ_sideber_open(false);
                }
            }
        },
        render_product_category: function(categ){
            var self = this;
            if(categ && categ[0]){
                var sub_categories_html = QWeb.render('CategoriesView',{
                    sub_categories: categ,
                    parent_categ_id:self.parent_categ_id,
                    widget:self,
                });
                $('.CustomCategories').html('');
                $('.CustomCategories').html(sub_categories_html);
                var $buttons = $('.js-category-switch');
                var order = this.pos.get_order();
                for(var i = 0; i < $buttons.length; i++){
                    $buttons[i].addEventListener('click',self.custom_switch_category_handler);
                }
            }
        },
        show_modifier_widget: function(product){
            this.modifier_widget.show_modifiers(product);
            $('.categories').hide();
        },
        hide_modifier_widget: function(){
            this.modifier_widget.hide_modifiers();
            $('.categories').show();
        },
        partner_icon_url: function(id){
            return '/web/image?model=res.partner&id='+id+'&field=image_small';
        },
    });

    screens.ReceiptScreenWidget.include({
        show: function(){
            var self = this;
            var order = this.pos.get_order();
            var barcode_val = order.get_giftcard();
            var vouchers = order.get_voucher();
            var counter = [];
            if(self.pos.config.enable_print_valid_days && self.pos.get_cashier().access_print_valid_days){
                var order_category_list = [];
                var orderlines = order.get_orderlines();
                _.each(orderlines, function(orderline){
                    if(orderline.get_product().pos_categ_id){
                        var category = self.pos.db.get_category_by_id(orderline.get_product().pos_categ_id[0]);
                        if (category && category.return_valid_days > 0){
                            order_category_list.push({
                                "id": category.id,
                                "name": category.name,
                                "return_valid_days": category.return_valid_days || self.pos.config.default_return_valid_days,
                            });
                        } else if(category && category.return_valid_days < 1){
                            var temp = self.find_parent_category(category);
                            order_category_list.push(temp);
                        }
                    } else {
                        order_category_list.push({
                            "id": self.pos.db.root_category_id,
                            "name": "others",
                            "return_valid_days": self.pos.config.default_return_valid_days,
                        });
                    }
                });
                this.final_order_category_list = _.uniq(order_category_list, function(item){
                    return item.id;
                });
            }
//            if(self.pos.config.enable_gift_voucher){
//                if(order.get_voucher()){
//                    var voucher_use = _.countBy(vouchers, 'voucher_code');
//                    _.each(vouchers, function(voucher){
//                        if(_.where(counter, {voucher_code: voucher.voucher_code}).length < 1){
//                            counter.push({
//                                voucher_name : voucher.display_name,
//                                voucher_code: voucher.voucher_code,
//                                remaining_redeemption: voucher.redemption_customer - (voucher.already_redeemed > 0 ? voucher.already_redeemed + voucher_use[voucher.voucher_code] : voucher_use[voucher.voucher_code]),
//                            });
//                        }
//                    });
//                    order.set_remaining_redeemption(counter);
//                }
//            }
            this._super();
            if( barcode_val && barcode_val[0]){
                var barcode = barcode_val[0].giftcard_card_no;
                $("tr#barcode_giftcard").html($("<td style='padding:2px 2px 2px 38px; text-align:center;'><div class='" + barcode + "' width='150' height='50' /></td>"));
                $("." + barcode.toString()).barcode(barcode.toString(), "code128");
                $("td#barcode_val_giftcard").html(barcode);
            }
            var barcode_recharge_val = order.get_recharge_giftcard();
            if( barcode_recharge_val && barcode_recharge_val[0]){
                var barcode = barcode_recharge_val[0].recharge_card_no;
                $("tr#barcode_recharge").html($("<td style='padding:2px 2px 2px 38px; text-align:center;'><div class='" + barcode + "' width='150' height='50' /></td>"));
                $("." + barcode.toString()).barcode(barcode.toString(), "code128");
                $("td#barcode_val_recharge").html(barcode);
            }
            var barcode_free_val = order.get_free_data();
            if( barcode_free_val){
                var barcode = barcode_free_val.giftcard_card_no;
                $("tr#barcode_free").html($("<td style='padding:2px 2px 2px 38px; text-align:center;'><div class='" + barcode + "' width='150' height='50' /></td>"));
                $("." + barcode.toString()).barcode(barcode.toString(), "code128");
                $("td#barcode_val_free").html(barcode);
            }

            var barcode_redeem_val = order.get_redeem_giftcard();
            if( barcode_redeem_val && barcode_redeem_val[0]){
                var barcode = barcode_redeem_val[0].redeem_card;
                $("tr#barcode_redeem").html($("<td style='padding:2px 2px 2px 38px; text-align:center;'><div class='" + barcode + "' width='150' height='50' /></td>"));
                $("." + barcode.toString()).barcode(barcode.toString(), "code128");
                $("td#barcode_val_redeem").html(barcode);
            }
        },
        find_parent_category: function(category){
            var self = this;
            if (category){
                if(!category.parent_id){
                    return {
                        "id": category.id,
                        "name": category.name,
                        "return_valid_days": category.return_valid_days || self.pos.config.default_return_valid_days,
                    };
                }
                if(category.return_valid_days > 0){
                    return {
                        "id": category.id,
                        "name": category.name,
                        "return_valid_days": category.return_valid_days || self.pos.config.default_return_valid_days,
                    };
                } else {
                    category = self.pos.db.get_category_by_id(category.parent_id[0]);
                    return self.find_parent_category(category)
                }
            }
        },
        render_receipt: function() {
            var order = this.pos.get_order();
            if (order.get_free_data()){
                this.$('.pos-receipt-container').html(QWeb.render('FreeTicket',{
                    widget:this,
                    order: order,
                }));
            }else if(order.get_receipt()){
                var no = $('input#no_of_copies').val()
                var category_data = '';
                var order_data = '';
                var payment_data = '';
                if(order.get_order_list() && Object.keys(order.get_order_list().order_report).length == 0 ){
                    order_data = false;
                }else{
                    if(order.get_order_list()){
                        order_data = order.get_order_list()['order_report']
                    }
                }
                if(Object.keys(order.get_order_list().category_report).length == 0 ){
                    category_data = false;
                }else{
                    category_data = order.get_order_list()['category_report']
                }
                if(Object.keys(order.get_order_list().payment_report).length == 0 ){
                    payment_data = false;
                }else{
                    payment_data = order.get_order_list()['payment_report']
                }
                var receipt = "";
                for(var i=0;i < no;i++){
                    receipt += QWeb.render('CustomTicket',{
                        widget:this,
                        order: order,
                        receipt: order.export_for_printing(),
                        order_report : order_data,
                        category_report : category_data,
                        payment_report : payment_data
                    })
                }
                this.$('.pos-receipt-container').html(receipt);
            } else if(order.get_order_summary_report_mode()){
                var no = $('#no_of_summary').val();
                if(!order.get_product_summary_report()){
                    return;
                }
                var product_summary_key = Object.keys(order.get_product_summary_report()['product_summary'] ? order.get_product_summary_report()['product_summary'] :false );
                if(product_summary_key.length > 0){
                    var product_summary_data = order.get_product_summary_report()['product_summary'];
                } else {
                    var product_summary_data = false;
                }
                var category_summary_key = Object.keys(order.get_product_summary_report()['category_summary']);
                 if(category_summary_key.length > 0){
                    var category_summary_data = order.get_product_summary_report()['category_summary'];
                } else {
                    var category_summary_data = false;
                }
                 var payment_summary_key = Object.keys(order.get_product_summary_report()['payment_summary']);
                 if(payment_summary_key.length > 0){
                     var payment_summary_data = order.get_product_summary_report()['payment_summary'];
                } else {
                    var payment_summary_data = false;
                }
                var location_summary_key = Object.keys(order.get_product_summary_report()['location_summary']);
                 if(location_summary_key.length > 0){
                     var location_summary_data = order.get_product_summary_report()['location_summary'];
                } else {
                    var location_summary_data = false;
                }
                var receipt = "";
                for (var step = 0; step < no; step++) {
                    receipt += QWeb.render('ProductSummaryReport',{
                        widget:this,
                        order: order,
                        receipt: order.export_for_printing(),
                        product_details: product_summary_data,
                        category_details: category_summary_data,
                        payment_details: payment_summary_data,
                        location_details:location_summary_data,
                    })
                }
                this.$('.pos-receipt-container').html(receipt);
            } else if(order.get_sales_summary_mode() && order.get_sales_summary_vals()) {
                var journal_key = Object.keys(order.get_sales_summary_vals()['journal_details']);
                if(journal_key.length > 0){
                    var journal_summary_data = order.get_sales_summary_vals()['journal_details'];
                } else {
                    var journal_summary_data = false;
                }
                var sales_key = Object.keys(order.get_sales_summary_vals()['salesmen_details']);
                if(sales_key.length > 0){
                    var sales_summary_data = order.get_sales_summary_vals()['salesmen_details'];
                } else {
                    var sales_summary_data = false;
                }
                var total = Object.keys(order.get_sales_summary_vals()['summary_data']);
                if(total.length > 0){
                    var total_summary_data = order.get_sales_summary_vals()['summary_data'];
                } else {
                    var total_summary_data = false;
                }
                var receipt = "";
                receipt = QWeb.render('PaymentSummaryReport',{
                    widget:this,
                    order: order,
                    receipt: order.export_for_printing(),
                    journal_details: journal_summary_data,
                    salesmen_details: sales_summary_data,
                    total_summary : total_summary_data
                })
                this.$('.pos-receipt-container').html(receipt);
            } else if(order.get_receipt_mode()){
                var data = order.get_product_vals();
                var receipt = "";
                receipt = QWeb.render('OutStockPosReport',{
                    widget:this,
                    order: order,
                    receipt: order.export_for_printing(),
                    location_data: order.get_location_vals(),
                    product_data: data,
                })
                this.$('.pos-receipt-container').html(receipt);
            } else if(order.get_money_inout_details()){
                if(order.get_money_inout_details()){
                    $('.pos-receipt-container', this.$el).html(QWeb.render('MoneyInOutTicket',{
                       widget:this,
                       order: order,
                       money_data: order.get_money_inout_details(),
                    }));
                }
            } else if(order.get_delivery_payment_data()){
                $('.pos-receipt-container', this.$el).html(QWeb.render('DeliveryPaymentTicket',{
                    widget:this,
                    order: order,
                    pos_order: order.get_delivery_payment_data(),
                 }));
            }else{
                if(order && order.is_reprint){
                    this.$('.pos-receipt-container').html(order.print_receipt_html);
                }else{
                    this.$('.pos-receipt-container').html(QWeb.render('PosTicket',this.get_receipt_render_env()));
                    if(this.pos.config.generate_token && this.pos.config.seperate_receipt){
                        $('.pos-receipt-container', this.$el).append(QWeb.render('TokenTicket',{
                            widget:this,
                            order: order,
                            orderlines: order.get_orderlines(),
                         }));
                    }
                }
            }
            var barcode_val = this.pos.get_order().get_name();
            if (barcode_val.indexOf(_t("Order ")) != -1) {
                var vals = barcode_val.split(_t("Order "));
                if (vals) {
                    var barcode = vals[1];
                    $("tr#barcode1").html($("<td style='padding:2px 2px 2px 0px; text-align:center;'><div class='" + barcode + "' width='150' height='50'/></td>"));
                    $("." + barcode.toString()).barcode(barcode.toString(), "code128");
                }
            }                      
        },
        get_receipt_render_env: function() {
            this.pos.last_receipt_render_env = this._super();
            var order = this.pos.get_order();
            var client_data = this.get_client_data();
            
            return {
                        widget: this,
                        pos: this.pos,
                        order: order,
                        receipt: order.export_for_printing(),
                        orderlines: order.get_orderlines(),
                        paymentlines: order.get_paymentlines(),
                        do_debit_payment:this.do_debit_payment(),
                        client_data:client_data,
                        //credit_balance: this.pos.get_client().remaining_credit_amount
                    };
        },
        get_client_data: function()
        {
            var partner_id = Number($('.client-line.highlight').attr('-id')) || Number($('.client-line.lowlight').attr('data-id'));
            var client = this.pos.get_order().get_client();
            var client_id = null;
            if (client){
                client_id = client.id; 
            }
            partner_id = partner_id ? partner_id : client_id;
            
            //var amount = Number($('.total').attr('amount'));
            var order = this.pos.get_order();
            var amount = order.getNetTotalTaxIncluded();
            var params = {
                model: 'res.partner',
                method: "get_partner_data",
                args: [partner_id, amount],
            }
            var partner = null;
            rpc.query(params, {async: false}).then(function(partner_response)
            {
                partner = partner_response;
                return partner;
            });
            return partner
        },
        do_debit_payment: function () 
        {
            var self = this;
            var order = this.pos.get_order();
            
            if(order.get_is_debit())
            {
                console.log("Adding debit transaction")
                var journal = false;
                var params = {
                    model: 'account.journal',
                    method: "get_journal_by_code",
                    args: ['PREPD'],
                }
                rpc.query(params, {async: false}).then(function(journal)
                {
                    var get_journal_id = false;                
                    var cashregister = false;
                    console.log("ID")
                    console.log(journal)
                    if(journal)
                    {
                        get_journal_id = journal._id
                    }

                    if(!get_journal_id)
                    {
                        for(var i in self.pos.cashregisters){
                            var reg = self.pos.cashregisters[i];
                            if(String(reg.journal_id[1]).includes('Efectivo')){
                                cashregister = reg;
                            }
                        }
                        get_journal_id = cashregister.journal_id[0];
                    }
                    
                    if (get_journal_id)
                    {                                    
                        
                        //var amount = Number($('.total').attr('amount'));
                        var amount = order.getNetTotalTaxIncluded();
                        if(amount==0)
                        {
                            amount=9;
                        }
                        var pos_session_id = self.pos.pos_session.name;
                        var partner_id = Number($('.client-line.highlight').attr('-id')) || Number($('.client-line.lowlight').attr('data-id'));
                        var client = self.pos.get_order().get_client()
                        partner_id = partner_id ? partner_id : client.id;
                        var cashier_id = self.pos.get_cashier().id;
                        var params = {
                            model: 'account.payment',
                            method: "payment_debit",
                            args: [get_journal_id, amount, pos_session_id, partner_id, cashier_id, true,order.name],
                        }
                        
                        var interval = setInterval(function() 
                                                                {
                                                                    rpc.query(params, {async: false}).then(function(vals){
                                                                        if(vals)
                                                                        {
                                                                            if(vals.affected_order.length>0)
                                                                            {
                                                                                clearInterval(interval);
                                                                            }
                                                                        }
                                                                    });
                                                                    
                                                                },10);
                        
                        
                    }
                });
                
            }

            if(order.get_is_credit())
            {
                var journal = false;
                var params = {
                    model: 'account.journal',
                    method: "get_journal_by_code",
                    args: ['POSCR'],
                }
                rpc.query(params, {async: false}).then(function(journal)
                {
                    var get_journal_id = false;                
                    var cashregister = false;
                    console.log("ID")
                    console.log(journal)
                    if(journal)
                    {
                        get_journal_id = journal._id
                    }
                    else
                    {
                        self.pos.db.notification('danger',_t("Debe definir un diario para Postpago con código POSTP."));
                        return;
                    }

                    if (get_journal_id)
                    {                                    
                        
                        //var amount = Number($('.total').attr('amount'));
                        var amount = order.getNetTotalTaxIncluded();
                        
                        var pos_session_id = self.pos.pos_session.name;
                        var partner_id = Number($('.client-line.highlight').attr('-id')) || Number($('.client-line.lowlight').attr('data-id'));
                        var client = self.pos.get_order().get_client()
                        partner_id = partner_id ? partner_id : client.id;
                        var cashier_id = self.pos.get_cashier().id;
                        var payment_lines = order.get_paymentlines();
                        var amount_is_low = false;
                        var amount_credit = 0.0;
                        _.map(payment_lines, function(line){
                            if (line.name === "POS-Crédito (MXN)"){
                                amount_credit += line.amount;
                                amount_is_low = true;
                            }
                        });
                        if (amount_is_low){

                        }

                        var params = {
                            model: 'account.payment',
                            method: "payment_credit",
                            args: [get_journal_id, amount, pos_session_id, partner_id, cashier_id, true,order.name],
                        }
                        
                        var interval = setInterval(function() 
                                                                {
                                                                    rpc.query(params, {async: false}).then(function(vals){
                                                                        if(vals)
                                                                        {
                                                                            if(vals.affected_order.length>0)
                                                                            {
                                                                                clearInterval(interval);
                                                                            }
                                                                        }
                                                                    });
                                                                    
                                                                },10);
                        
                        
                    }
                });
                
            }

            if(order.get_is_meal_plan())
            {
                var journal = false;
                var params = {
                                model: 'account.journal',
                                method: "get_journal_by_code",
                                args: ['MEALP'],
                            }
                rpc.query(params, {async: false}).then(function(journal)
                {
                    var get_journal_id = false;                
                    var cashregister = false;
                    console.log("ID")
                    console.log(journal)
                    if(journal)
                    {
                        get_journal_id = journal._id
                    }

                    if(!get_journal_id)
                    {
                        for(var i in self.pos.cashregisters){
                            var reg = self.pos.cashregisters[i];
                            if(String(reg.journal_id[1]).includes('Efectivo')){
                                cashregister = reg;
                            }
                        }
                        get_journal_id = cashregister.journal_id[0];
                    }
                    
                    if (get_journal_id)
                    {                                    
                        
                        //var amount = Number($('.total').attr('amount'));
                        var amount = order.getNetTotalTaxIncluded();
                        var pos_session_id = self.pos.pos_session.name;
                        var partner_id = Number($('.client-line.highlight').attr('-id')) || Number($('.client-line.lowlight').attr('data-id'));
                        var client = self.pos.get_order().get_client()
                        partner_id = partner_id ? partner_id : client.id;
                        var cashier_id = self.pos.get_cashier().id;
                        var params = {
                            model: 'account.payment',
                            method: "payment_meal_plan",
                            args: [get_journal_id, amount, pos_session_id, partner_id, cashier_id, true,order.name],
                        }
                        
                        var interval = setInterval(function() 
                                                                {
                                                                    rpc.query(params, {async: false}).then(function(vals)
                                                                    {
                                                                        if(vals)
                                                                        {
                                                                            if(vals.affected_order.length>0)
                                                                            {
                                                                                clearInterval(interval);
                                                                            }
                                                                        }
                                                                    });
                                                                    
                                                                },10);
                        
                        
                    }
                });
                
            }

        },
        render_change: function() {
            this._super();
            this.$('.total-value').html(this.format_currency(this.pos.get_order().getNetTotalTaxIncluded()));
        },
        print_xml: function() {
            var order = this.pos.get_order();
            var env = {
                widget:  this,
                pos: this.pos,
                order: this.pos.get_order(),
                receipt: this.pos.get_order().export_for_printing(),
                paymentlines: this.pos.get_order().get_paymentlines()
            };
            if(order.get_free_data()){
                var receipt = QWeb.render('XmlFreeTicket',env);
            } else if(order.get_delivery_payment_data()){
                var data = {
                    widget:  this,
                    pos: this.pos,
                    order: this.pos.get_order(),
                    pos_order: order.get_delivery_payment_data(),
                }
                var receipt = QWeb.render('XmlDeliveryPaymentTicket',data);
            } else{
                if(order && order.is_reprint){
                    order.is_reprint = false;
                    this.pos.proxy.print_receipt(order.print_xml_receipt_html);
                    return this.pos.get_order()._printed = true;
                }else{
                    var receipt = QWeb.render('XmlReceipt',env);
                    if(this.pos.config.generate_token && this.pos.config.seperate_receipt){
                        var token_receipt = QWeb.render('XMLTokenTicket',{
                            widget:this,
                            order: order,
                            orderlines: order.get_orderlines(),
                        });
                        this.pos.proxy.print_receipt(token_receipt);
                    }
                }
            }
            this.pos.proxy.print_receipt(receipt);
            this.pos.get_order()._printed = true;
            
        },
    });

    /* Order list screen */
    var OrderListScreenWidget = screens.ScreenWidget.extend({
        template: 'OrderListScreenWidget',

        init: function(parent, options){
            var self = this;
            this._super(parent, options);
            this.reload_btn = function(){
                $('.reload_order').toggleClass('rotate', 'rotate-reset');
                self.$el.find('#datepicker').val('');
                self.$el.find('.search_order1 input').val('');
                self.date = 'all';
                self.reloading_orders();
            };
            if(this.pos.config.iface_vkeyboard && self.chrome.widget.keyboard){
                self.chrome.widget.keyboard.connect(this.$('.searchbox input'));
            }
        },
        events: {
            'click .button.back':  'click_back',
            'keyup .searchbox input': 'search_order',
            'click .searchbox .search-clear': 'clear_search',
            'click .button.draft':  'click_draft',
            'click .button.paid': 'click_paid',
            'click .button.posted': 'click_posted',
            'click #print_order': 'click_reprint',
//	        'click #view_lines': 'click_view_lines',
            'click #edit_pos_order': 'click_edit_order',
            'click #re_order_duplicate': 'click_duplicate_order',
            //credit
            'click #pay_due_amt': 'pay_order_due',
            'click #edit_order':'edit_pos_order',
        },
        filter:"all",
        date: "all",
        get_orders: function(){
            return this.pos.get('pos_order_list');
        },
        click_back: function(){
            this.gui.show_screen('products');
        },
        click_draft: function(event){
            var self = this;
            if($(event.currentTarget).hasClass('selected')){
                $(event.currentTarget).removeClass('selected');
                self.filter = "all";
            }else{
                self.$('.button.paid').removeClass('selected');
                self.$('.button.posted').removeClass('selected');
                $(event.currentTarget).addClass('selected');
                self.filter = "draft";
            }
            self.render_list(self.get_orders());
        },
        click_paid: function(event){
            var self = this;
            if($(event.currentTarget).hasClass('selected')){
                $(event.currentTarget).removeClass('selected');
                self.filter = "all";
            }else{
                self.$('.button.draft').removeClass('selected');
                self.$('.button.posted').removeClass('selected');
                $(event.currentTarget).addClass('selected');
                self.filter = "paid";
            }
            self.render_list(self.get_orders());
        },
        click_posted: function(event){
            var self = this;
            if($(event.currentTarget).hasClass('selected')){
                $(event.currentTarget).removeClass('selected');
                self.filter = "all";
            }else{
                self.$('.button.paid').removeClass('selected');
                self.$('.button.draft').removeClass('selected');
                $(event.currentTarget).addClass('selected');
                self.filter = "done";
            }
            self.render_list(self.get_orders());
        },
        clear_cart: function(){
            var self = this;
            var order = self.pos.get_order();
            var currentOrderLines = order.get_orderlines();
            var lines_ids = []
            if(!order.is_empty()) {
                _.each(currentOrderLines,function(item) {
                    lines_ids.push(item.id);
                });
                _.each(lines_ids,function(id) {
                    order.remove_orderline(order.get_orderline(id));
                });
            }
        },
        pay_order_due: function(event, order_id){
            var self = this;
            var order_id = event ? parseInt($(event.currentTarget).data('id')) : order_id;
            var selectedOrder = this.pos.get_order();
            var result = self.pos.db.get_order_by_id(order_id);
            if(!result){
                var params = {
                    model: 'pos.order',
                    method: 'search_read',
                    domain: [['id', '=', order_id], ['state', 'not in', ['draft']]]
                }
                rpc.query(params, {async: false}).then(function(order){
                    if(order && order[0])
                        result = order[0]
                });
            }
            if(result){
                if(result.state == "paid"){
                    alert(_t("Sorry, This order is paid State"));
                    return
                }
                if(result.state == "done"){
                    alert(_t("Sorry, This Order is Done State"));
                    return
                }
                if (result && result.lines.length >= 0) {
                    self.clear_cart();
                    selectedOrder.set_client(null);
                    if (result.partner_id && result.partner_id[0]) {
                        var partner = self.pos.db.get_partner_by_id(result.partner_id[0])
                        if(partner){
                            selectedOrder.set_client(partner);
                        }
                    }
                    if(result.order_on_debit){
                        selectedOrder.set_order_on_debit(true);
                        $('#pos-debit').hide();
                    }
                    selectedOrder.set_pos_reference(result.pos_reference);
                    selectedOrder.set_paying_order(true);
                    selectedOrder.set_order_id(order_id);
                    selectedOrder.set_sequence(result.name);
                    selectedOrder.set_delivery(result.is_delivery);
                    if(result.lines.length >= 0){
                        var order_lines = self.get_orderlines_from_order(result.lines);
                        if(order_lines.length >= 0){
                            _.each(order_lines, function(line){
                                var product = self.pos.db.get_product_by_id(Number(line.product_id[0]));
                                if(product){
                                    selectedOrder.add_product(product, {
                                        quantity: line.qty,
                                        discount: line.discount,
                                        price: line.price_unit,
                                    });
                                }
                            });
                            var prd = self.pos.db.get_product_by_id(self.pos.config.prod_for_payment[0]);
                            if(prd && result.amount_due){
                                var paid_amt = result.amount_total - result.amount_due;
                                selectedOrder.add_product(prd,{'price':-paid_amt});
                            }
                            self.gui.show_screen('payment');
                            if(result.picking_id){
                                $('.deliver_items').hide();
                            }
                            if(result.amount_due == 0){
                                selectedOrder.set_amount_paid(result.amount_paid)
                            }
                        }
                    }
                }
            }
        },
        show: function(){
            var self = this;
            this._super();
            this.reload_orders();
            $('input#datepicker').datepicker({
                dateFormat: 'yy-mm-dd',
                autoclose: true,
                closeText: 'Clear',
                showButtonPanel: true,
                onSelect: function (dateText, inst) {
                    var date = $(this).val();
                    if (date){
                        self.date = date;
                        self.render_list(self.get_orders());
                    }
                },
                onClose: function(dateText, inst){
                    if( !dateText ){
                        self.date = "all";
                        self.render_list(self.get_orders());
                    }
                }
           }).focus(function(){
                var thisCalendar = $(this);
                $('.ui-datepicker-close').click(function() {
                    thisCalendar.val('');
                    self.date = "all";
                    self.render_list(self.get_orders());
                });
           });
           $('.button.paid').removeClass('selected').trigger('click');
        },
        get_journal_from_order: function(statement_ids){
            var self = this;
            var order = this.pos.get_order();
            var params = {
                model: 'account.bank.statement.line',
                method: 'search_read',
                domain: [['id', 'in', statement_ids]],
            }
            rpc.query(params, {async: false}).then(function(statements){
                if(statements.length > 0){
                    var order_statements = []
                    _.each(statements, function(statement){
                        if(statement.amount > 0){
                            order_statements.push({
                                amount: statement.amount,
                                journal: statement.journal_id[1],
                            })
                        }
                    });
                    order.set_journal(order_statements);
                }
            }).fail(function(){
                self.pos.db.notification('danger',"Connection lost");
            });
        },
        get_orderlines_from_order: function(line_ids){
            var self = this;
            var order = this.pos.get_order();
            var orderlines = false;
            var params = {
                model: 'pos.order.line',
                method: 'load_pos_order_lines',
                args: [line_ids],
            }
            rpc.query(params, {async: false}).then(function(order_lines){
                if(order_lines.length > 0){
                    orderlines = order_lines;
                }
            }).fail(function(){
                self.pos.db.notification('danger',"Connection lost");
            });
            return orderlines
        },
        click_reprint: function(event){
            var self = this;
            var selectedOrder = this.pos.get_order();
            var order_id = parseInt($(event.currentTarget).data('id'));
            selectedOrder.empty_cart();
            selectedOrder.set_client(null);
            var selectedOrder = this.pos.get_order();
            var result = self.pos.db.get_order_by_id(order_id);
            if(result.pos_normal_receipt_html){
                selectedOrder.print_receipt_html = result.pos_normal_receipt_html;
                selectedOrder.print_xml_receipt_html = result.pos_xml_receipt_html;
                selectedOrder.is_reprint = true;
                selectedOrder.name = result.pos_reference;
                self.gui.show_screen('receipt');
            }else{
                if (result && result.lines.length > 0) {
                    if (result.partner_id && result.partner_id[0]) {
                        var partner = self.pos.db.get_partner_by_id(result.partner_id[0])
                        if(partner){
                            selectedOrder.set_client(partner);
                        }
                    }
                    selectedOrder.set_amount_paid(result.amount_paid);
                    selectedOrder.set_amount_return(Math.abs(result.amount_return));
                    selectedOrder.set_amount_tax(result.amount_tax);
                    selectedOrder.set_amount_total(result.amount_total);
                    selectedOrder.set_company_id(result.company_id[1]);
                    selectedOrder.set_date_order(result.date_order);
                    selectedOrder.set_pos_reference(result.pos_reference);
                    selectedOrder.set_user_name(result.user_id && result.user_id[1]);
                    if(result.statement_ids.length > 0){
                        self.get_journal_from_order(result.statement_ids);
                    }
                    if(result.lines.length > 0){
                        var order_lines = self.get_orderlines_from_order(result.lines);
                        if(order_lines.length > 0){
                            _.each(order_lines, function(line){
                                var product = self.pos.db.get_product_by_id(Number(line.product_id[0]));
                                if(product){
                                    selectedOrder.add_product(product, {
                                        quantity: line.qty,
                                        discount: line.discount,
                                        price: line.price_unit,
                                    })
                                }
                            })
                        }
                    }
                    selectedOrder.set_order_id(order_id);
                    self.gui.show_screen('receipt');
                }
            }
        },
//        click_view_lines: function(event){
//        	var self = this;
//        	var order_id = parseInt($(event.currentTarget).data('id'));
//            var order = this.pos.get_order();
//            var result = self.pos.db.get_order_by_id(order_id);
//            if(result.lines.length > 0){
//            	var order_lines = self.get_orderlines_from_order(result.lines);
//            	if(order_lines){
//            		self.gui.show_popup('product_popup', {
//            			order_lines: order_lines,
//            			order_id: order_id,
//            			state: result.state,
//            			order_screen_obj: self,
//            		});
//            	}
//            }
//        },
        click_duplicate_order: function(event){
            var self = this;
            var order_id = parseInt($(event.currentTarget).data('id'));
            var selectedOrder = this.pos.get_order();
            var result = self.pos.db.get_order_by_id(order_id);
            var gift_card_product_id = self.pos.config.gift_card_product_id[0] || false;
            if(result.lines.length > 0){
                var order_lines = self.get_orderlines_from_order(result.lines);
                if(order_lines && order_lines[0]){
                    var valid_product = false;
                    order_lines.map(function(line){
                        if(line.product_id && line.product_id[0]){
                            var product = self.pos.db.get_product_by_id(line.product_id[0]);
                            if((product && !product.is_dummy_product) && (line.line_status != 'full')){
                                valid_product = true;
                            }
                        }
                    });
                    if(valid_product){
                        self.gui.show_popup('duplicate_product_popup',{
                            order_lines:order_lines,
                            'old_order':result,
                        });
                    }else{
                        self.pos.db.notification('danger',_t("Products is not valid for reorder."));
                    }
                }
            }
        },
        click_edit_order: function(event){
            var self = this;
            var order_id = parseInt($(event.currentTarget).data('id'));
            var result = self.pos.db.get_order_by_id(order_id);
//            if(result && result.lines.length > 0){
                var selectedOrder = this.pos.get_order();
                self.pos.chrome.screens.orderlist.clear_cart();
                selectedOrder.set_client(null);
                if (result.partner_id && result.partner_id[0]) {
                    var partner = self.pos.db.get_partner_by_id(result.partner_id[0]);
                    if(partner){
                        selectedOrder.set_client(partner);
                    }
                }
                selectedOrder.set_pos_reference(result.pos_reference);
                selectedOrder.set_order_id(order_id);
                selectedOrder.set_sequence(result.name);
//	           	if(result.lines.length > 0){
                    if(result.table_ids && result.table_ids.length > 0){
                        if(result.rest_table_reservation_id.length > 0){
//	           	 			var table = self.pos.tables_by_id[result.table_ids[0]];
//	           	 			if(table){
//	           	 				self.pos.set_table(table);
//	           	 			}
                        }
                        var merged_tables = [];
                        result.table_ids.map(function(id){
                            if(self.pos.table.id != id){
                                var table_name = self.pos.tables_by_id[id];
                                if(table_name && table_name.name){
                                    merged_tables.push(table_name);
                                    table_name.parent_linked_table = self.pos.table;
                                }
                            }
                        });
                        selectedOrder.set_merge_table_ids(result.table_ids);
                        $('span.orders.touch-scrollable .floor-button').replaceWith(QWeb.render('BackToFloorButton',{table: self.pos.table, floor:self.pos.table.floor,merged_tables:merged_tables}));
                        $('span.orders.touch-scrollable .floor-button').click(function(){
                            self.pos.chrome.widget.order_selector.floor_button_click_handler();
                        });
                    }
                    if(result.asst_cashier_id.length > 0){
                        selectedOrder.asst_cashier_id = result.asst_cashier_id[0];
                    }
                    var order_lines = self.pos.chrome.screens.orderlist.get_orderlines_from_order(result.lines);
                    if(order_lines.length > 0){
                        _.each(order_lines, function(line){
                            if(line.modifier || line.combo_product_id.length > 0){
                                return true;
                            }
                            var product = self.pos.db.get_product_by_id(Number(line.product_id[0]));
                            selectedOrder.add_product(product, {
                                quantity: line.qty,
                                discount: line.discount,
                                price: line.price_unit,
                            });
                            var selected_orderline = selectedOrder.get_selected_orderline();
                            if(selected_orderline){
                                if(line.deliver){
                                    selected_orderline.set_deliver_info(true);
                                    if(line.delivery_product_id.length > 0){
                                        selected_orderline.set_delivery_charges_color(true);
                                        selected_orderline.set_delivery_charges_flag(true);
                                        selected_orderline.set_delivery_product_id(line.delivery_product_id[0]);
                                        selected_orderline.state = 'done';
                                        selectedOrder.set_delivery(true);
                                    }
                                }
                                if(line.tech_combo_data && line.tech_combo_data[0]){
                                    selected_orderline.set_combo_prod_info(line.tech_combo_data);
                                    self.pos.chrome.screens.products.order_widget.rerender_orderline(selected_orderline);
                                }
                                selected_orderline.state = line.state;
                                selected_orderline.set_note(line.line_note || '');
                                selected_orderline.set_take_away(line.is_takeaway ? true : false);
                                if(line.pos_cid){
                                    selected_orderline.cid = line.pos_cid;
                                }
                                var params = {
                                    model: 'modifier.order.line',
                                    method: 'search_read',
                                    domain: [['id', 'in', line.mod_lines]],
                                }
                                rpc.query(params, {async: false}).then(function(modifiers){
                                    if(modifiers && modifiers[0]){
                                        modifiers.map(function(modifier){
                                            selected_orderline.set_modifier_line({
                                                   id: modifier.prod_mod_id[0],
                                                   price: Number(modifier.price),
                                                   product_id: modifier.product_id[0],
                                                   name:modifier.display_name,
                                                   consider: false,
                                               }, modifier.qty);
                                        });
                                    }
                                });
                            }
                        });
                        if(selectedOrder.get_delivery()){
                            selectedOrder.set_is_delivery(true);
                            selectedOrder.set_delivery_date(result.delivery_date);
                            selectedOrder.set_delivery_time(result.delivery_time);
                            selectedOrder.set_delivery_address(result.delivery_address);
                            selectedOrder.set_delivery_user_id(result.delivery_user_id[0]);
                        }
                    }
//	            }
                selectedOrder.name = result.pos_reference;
                self.chrome.screens.products.order_widget.renderElement();
                self.gui.show_screen('products');
//            }
        },
        search_order: function(event){
            var self = this;
            var search_timeout = null;
            clearTimeout(search_timeout);
            var query = $(event.currentTarget).val();
            search_timeout = setTimeout(function(){
                self.perform_search(query,event.which === 13);
            },70);
        },
        perform_search: function(query, associate_result){
            var self = this;
            if(query){
                var orders = this.pos.db.search_order(query);
                if ( associate_result && orders.length === 1){
                    this.gui.back();
                }
                this.render_list(orders);
            }else{
                var orders = self.pos.get('pos_order_list');
                this.render_list(orders);
            }
        },
        clear_search: function(){
            var orders = this.pos.get('pos_order_list');
            this.render_list(orders);
            this.$('.searchbox input')[0].value = '';
            this.$('.searchbox input').focus();
        },
        check_filters: function(orders){
            var self = this;
            var filtered_orders = false;
            if(self.filter !== "" && self.filter !== "all"){
                filtered_orders = $.grep(orders,function(order){
                    return order.state === self.filter;
                });
            }
            return filtered_orders || orders;
        },
        check_date_filter: function(orders){
            var self = this;
            var date_filtered_orders = [];
            if(self.date !== "" && self.date !== "all"){

                for (var i=0; i<orders.length;i++){
                    var date_order = $.datepicker.formatDate("yy-mm-dd",new Date(orders[i].date_order));
                    if(self.date === date_order){
                        date_filtered_orders.push(orders[i]);
                    }
                }
            }
            return date_filtered_orders;
        },
        render_list: function(orders){
            var self = this;
            if(orders){
                var contents = this.$el[0].querySelector('.order-list-contents');
                contents.innerHTML = "";
                var temp = [];
                orders = self.check_filters(orders);
                if(self.date !== "" && self.date !== "all"){
                    orders = self.check_date_filter(orders);
                }
                for(var i = 0, len = Math.min(orders.length,1000); i < len; i++){
                    var order    = orders[i];
                    var orderlines = [];
                    order.amount_total = parseFloat(order.amount_total).toFixed(2);
                    var table_ids_str = '';
                    if(order && order.table_ids[0]){
                        order.table_ids.map(function(table_id){
                            if(self.pos.tables_by_id[table_id]){
                                table_ids_str += self.pos.tables_by_id[table_id].name +", ";
                            }
                        });
                    }
                    order['table_ids_str'] = table_ids_str.replace(/,\s*$/, "");
                    var clientline_html = QWeb.render('OrderlistLine',{widget: this, order:order, orderlines:orderlines});
                    var clientline = document.createElement('tbody');
                    clientline.innerHTML = clientline_html;
                    clientline = clientline.childNodes[1];
                    contents.appendChild(clientline);
                }
//	            $("table.order-list").simplePagination({
//	            	previousButtonClass: "btn btn-danger",
//	            	nextButtonClass: "btn btn-danger",
//	            	previousButtonText: '<i class="fa fa-angle-left fa-lg"></i>',
//	            	nextButtonText: '<i class="fa fa-angle-right fa-lg"></i>',
//	            	perPage:self.pos.config.record_per_page > 0 ? self.pos.config.record_per_page : 10
//	            });
            }
        },
        reload_orders: function(){
            var self = this;
            var orders=self.pos.get('pos_order_list');
            this.render_list(orders);
        },
        reloading_orders: function(){
            var self = this;
            var date = new Date();
            var params = {
                model: 'pos.order',
                method: 'ac_pos_search_read',
                args: [{'domain': this.pos.domain_as_args}],
            }
            return rpc.query(params, {async: false}).then(function(orders){
                if(orders.length > 0){
                    self.pos.db.add_orders(orders);
                    self.pos.set({'pos_order_list' : orders});
                    self.reload_orders();
                }
            }).fail(function (type, error){
                if( error.data && error.code === 200 ){    // Business Logic Error, not a connection problem
                   self.gui.show_popup('error-traceback',{
                        'title': error.data.message,
                        'body':  error.data.debug
                   });
                } else {
                    self.pos.db.notification('danger','Connection lost');
                }
            });
        },
        edit_pos_order: function(event){
            var self = this;
            var order_id = parseInt($(event.currentTarget).data('id'));
            var result = self.pos.db.get_order_by_id(order_id);
            var selectedOrder = this.pos.get_order();
            self.pos.chrome.screens.orderlist.clear_cart();
            selectedOrder.set_client(null);
            if (result.partner_id && result.partner_id[0]) {
                var partner = self.pos.db.get_partner_by_id(result.partner_id[0]);
                if(partner){
                    selectedOrder.set_client(partner);
                }
            }
            selectedOrder.set_pos_reference(result.pos_reference);
            selectedOrder.set_order_id(order_id);
            selectedOrder.set_sequence(result.name);
            if(result.lines.length > 0){
                if(result.table_ids && result.table_ids.length > 0){
                    var merged_tables = [];
                    result.table_ids.map(function(id){
                        if(self.pos.table.id != id){
                            var table_name = self.pos.tables_by_id[id];
                            if(table_name && table_name.name){
                                merged_tables.push(table_name);
                                table_name.parent_linked_table = self.pos.table;
                            }
                        }
                    });
                    selectedOrder.set_merge_table_ids(result.table_ids);
                    $('span.orders.touch-scrollable .floor-button').replaceWith(QWeb.render('BackToFloorButton',{table: self.pos.table, floor:self.pos.table.floor,merged_tables:merged_tables}));
                    $('span.orders.touch-scrollable .floor-button').click(function(){
                        self.pos.chrome.widget.order_selector.floor_button_click_handler();
                    });
                }
                if(result.asst_cashier_id.length > 0){
                    selectedOrder.asst_cashier_id = result.asst_cashier_id[0];
                }
                var order_lines = self.screens.orderlist.get_orderlines_from_order(result.lines);
                if(order_lines.length > 0){
                    _.each(order_lines, function(line){
                        if(line.modifier || line.combo_product_id.length > 0){
                            return true;
                        }
                        var product = self.pos.db.get_product_by_id(Number(line.product_id[0]));
                        selectedOrder.add_product(product, {
                            quantity: line.qty,
                            discount: line.discount,
                            price: line.price_unit,
                        });
                        var selected_orderline = selectedOrder.get_selected_orderline();
                        if(selected_orderline){
                            if(line.deliver){
                                selected_orderline.set_deliver_info(true);
                                if(line.delivery_product_id.length > 0){
                                    selected_orderline.set_delivery_charges_color(true);
                                    selected_orderline.set_delivery_charges_flag(true);
                                    selected_orderline.set_delivery_product_id(line.delivery_product_id[0]);
                                    selected_orderline.state = 'done';
                                    selectedOrder.set_delivery(true);
                                }
                            }
                            if(line.tech_combo_data && line.tech_combo_data[0]){
                                selected_orderline.set_combo_prod_info(line.tech_combo_data);
                                self.pos.chrome.screens.products.order_widget.rerender_orderline(selected_orderline);
                            }
                            selected_orderline.state = line.state;
                            selected_orderline.set_note(line.line_note || '');
                            selected_orderline.set_take_away(line.is_takeaway ? true : false);
                            if(line.pos_cid){
                                selected_orderline.cid = line.pos_cid;
                            }
                            var params = {
                                model: 'modifier.order.line',
                                method: 'search_read',
                                domain: [['id', 'in', line.mod_lines]],
                            }
                            rpc.query(params, {async: false}).then(function(modifiers){
                                if(modifiers && modifiers[0]){
                                    modifiers.map(function(modifier){
                                        selected_orderline.set_modifier_line({
                                               id: modifier.prod_mod_id[0],
                                               price: Number(modifier.price),
                                               product_id: modifier.product_id[0],
                                               name:modifier.display_name,
                                               consider: false,
                                           }, modifier.qty);
                                    });
                                }
                            });
                        }
                    });
                    if(selectedOrder.get_delivery()){
                        selectedOrder.set_is_delivery(true);
                        selectedOrder.set_delivery_date(result.delivery_date);
                        selectedOrder.set_delivery_time(result.delivery_time);
                        selectedOrder.set_delivery_address(result.delivery_address);
                        selectedOrder.set_delivery_user_id(result.delivery_user_id[0]);
                    }
                    selectedOrder.name = result.pos_reference;
                }
            }
            self.chrome.screens.products.order_widget.renderElement();
            self.gui.show_screen('products');
        },
        renderElement: function(){
            var self = this;
            self._super();
            self.el.querySelector('.button.reload').addEventListener('click',this.reload_btn);
        },
    });
    gui.define_screen({name:'orderlist', widget: OrderListScreenWidget});

    var GraphScreenWidget = screens.ScreenWidget.extend({
        template: 'GraphScreenWidget',
        init: function(parent, options){
            this._super(parent, options);
            this.bar_chart = function(){
                var self = this;
                var order = self.pos.get_order();
                var data = order.get_result();
                var dps = [];
                if(data){
                    for(var i=0;i<data.length;i++){
                        dps.push({label: data[i][0], y: data[i][1]});
                    }
                }
                var symbol = false;
                if($('#top_products').hasClass('menu_selected')){
                    symbol = 'Qty-#######.00';
                }else{
                    symbol = self.pos.currency.symbol ? self.pos.currency.symbol+"#######.00" : false;
                }
                var chart = new CanvasJS.Chart("chartContainer",{
                    width: data && data.length > 10 ? 1200 : 0,
                    dataPointMaxWidth:25,
                    zoomEnabled:true,
                    exportFileName: $('a.menu_selected').text(),
                    exportEnabled: true,
                    theme: "theme3",
                    title: {
                        text: $('a.menu_selected').text()
                    },
                    axisY: {
                        suffix: ""
                    },
                    legend :{
                        verticalAlign: 'bottom',
                        horizontalAlign: "center"
                    },
                    data: [{
                        type: "column",
                        bevelEnabled: true,
                        indexLabel:'{y}',
                        indexLabelOrientation: "vertical", //horizontal
                        yValueFormatString:symbol || '',
                        dataPoints: dps
                    }]
                });
                chart.render();
            };
            this.pie_chart = function(){
                var order = this.pos.get_order();
                var data = order.get_result();
                var dps = [];
                for(var i=0;i<data.length;i++){
                    dps.push({y: data[i][1], indexLabel: data[i][0]});
                }
                var chart = new CanvasJS.Chart("chartContainer",
                {
                    exportFileName: $('a.menu_selected').text(),
                    exportEnabled: true,
                    zoomEnabled:true,
                    theme: "theme2",
                    title:{
                        text: $('a.menu_selected').text()
                    },
                    data: [{
                        type: "pie",
                        showInLegend: true,
                        toolTipContent: "{y} - #percent %",
                        yValueFormatString: "",
                        legendText: "{indexLabel}",
                        dataPoints: dps
                    }]
                });
                chart.render();
            };
        },
        filter:"all",
        date: "all",
        show: function(){
            var self = this;
            this._super();
            $('#duration_selection').prop('selectedIndex',1);
            $("#start_date").val('');
            $("#end_date").val('');
            var from = false;
            var to = false;
//        	if($('#duration_selection').val() != "nofilter"){
                from = moment(new Date()).locale('en').format('YYYY-MM-DD')+" 00:00:00";
                to = moment(new Date()).locale('en').format('YYYY-MM-DD HH:mm:ss');
//        	}
            var active_chart = $('span.selected_chart').attr('id');
            var category = $('a.menu_selected').attr('id');
            var limit = $('#limit_selection').val() || 10;
            self.graph_data(from, to, active_chart, category, limit);
            self.bar_chart();
        },
        start: function(){
            var self = this;
            this._super();
            var active_chart = $('span.selected_chart').attr('id');
            var category = $('a.menu_selected').attr('id');
            var from;
            var to;
            var limit = $('#limit_selection').val() || 10;
            $("#start_date").datepicker({
                dateFormat: 'yy-mm-dd',
                onSelect: function(dateText, inst) {
                    active_chart = $('span.selected_chart').attr('id');
                    category = $('a.menu_selected').attr('id');
                    from = dateText + ' 00:00:00';
                    to = $("#end_date").val() ? to : false;
                    limit = $('#limit_selection').val() || 10;
                    $('#duration_selection').prop('selectedIndex',0);
                    self.graph_data(from, to, active_chart, category, limit);
                },
            });
            $("#end_date").datepicker({
                dateFormat: 'yy-mm-dd',
                onSelect: function(dateText, inst) {
                    active_chart = $('span.selected_chart').attr('id');
                    category = $('a.menu_selected').attr('id');
                    from = $("#start_date").val() ? from : false;
                    to = dateText + ' 23:59:59';
                    limit = $('#limit_selection').val() || 10;
                    $('#duration_selection').prop('selectedIndex',0);
                    self.graph_data(from, to, active_chart, category, limit);
                },
            });
            this.$('.back').click(function(){
                self.gui.back();
            });

            this.$('#duration_selection').on('change',function(){
                $("#start_date").val('');
                $("#end_date").val('');
                self.get_graph_information();
            });
            this.$('#limit_selection').on('change',function(){
                self.get_graph_information();
            });

            this.$('#top_customer').click(function(){
                if(!$('#top_customer').hasClass('menu_selected')){
                    $('#top_customer').addClass('menu_selected');
                    if(self.$('#top_products').hasClass('menu_selected')){
                        self.$('#top_products').removeClass('menu_selected');
                    }
                    if(self.$('#cashiers').hasClass('menu_selected')){
                        self.$('#cashiers').removeClass('menu_selected');
                    }
                    if(self.$('#sales_by_location').hasClass('menu_selected')){
                        self.$('#sales_by_location').removeClass('menu_selected');
                    }
                    if(self.$('#income_by_journals').hasClass('menu_selected')){
                        self.$('#income_by_journals').removeClass('menu_selected');
                    }
                    if(self.$('#top_category').hasClass('menu_selected')){
                        self.$('#top_category').removeClass('menu_selected');
                    }
                    if(self.$('#pos_benifit').hasClass('menu_selected')){
                        self.$('#pos_benifit').removeClass('menu_selected');
                    }
                }
                self.get_graph_information();
            });
            this.$('#top_products').click(function(){
                if(!$('#top_products').hasClass('menu_selected')){
                    $('#top_products').addClass('menu_selected');
                    if(self.$('#top_customer').hasClass('menu_selected')){
                        self.$('#top_customer').removeClass('menu_selected');
                    }
                    if(self.$('#cashiers').hasClass('menu_selected')){
                        self.$('#cashiers').removeClass('menu_selected');
                    }
                    if(self.$('#sales_by_location').hasClass('menu_selected')){
                        self.$('#sales_by_location').removeClass('menu_selected');
                    }
                    if(self.$('#income_by_journals').hasClass('menu_selected')){
                        self.$('#income_by_journals').removeClass('menu_selected');
                    }
                    if(self.$('#top_category').hasClass('menu_selected')){
                        self.$('#top_category').removeClass('menu_selected');
                    }
                    if(self.$('#pos_benifit').hasClass('menu_selected')){
                        self.$('#pos_benifit').removeClass('menu_selected');
                    }
                }
                self.get_graph_information();
            });
            this.$('#cashiers').click(function(){
                if(!$('#cashiers').hasClass('menu_selected')){
                    $('#cashiers').addClass('menu_selected');
                    if(self.$('#top_customer').hasClass('menu_selected')){
                        self.$('#top_customer').removeClass('menu_selected');
                    }
                    if(self.$('#top_products').hasClass('menu_selected')){
                        self.$('#top_products').removeClass('menu_selected');
                    }
                    if(self.$('#sales_by_location').hasClass('menu_selected')){
                        self.$('#sales_by_location').removeClass('menu_selected');
                    }
                    if(self.$('#income_by_journals').hasClass('menu_selected')){
                        self.$('#income_by_journals').removeClass('menu_selected');
                    }
                    if(self.$('#top_category').hasClass('menu_selected')){
                        self.$('#top_category').removeClass('menu_selected');
                    }
                    if(self.$('#pos_benifit').hasClass('menu_selected')){
                        self.$('#pos_benifit').removeClass('menu_selected');
                    }
                }
                self.get_graph_information();
            });
            this.$('#sales_by_location').click(function(){
                if(!$('#sales_by_location').hasClass('menu_selected')){
                    $('#sales_by_location').addClass('menu_selected');
                    if(self.$('#top_customer').hasClass('menu_selected')){
                        self.$('#top_customer').removeClass('menu_selected');
                    }
                    if(self.$('#top_products').hasClass('menu_selected')){
                        self.$('#top_products').removeClass('menu_selected');
                    }
                    if(self.$('#cashiers').hasClass('menu_selected')){
                        self.$('#cashiers').removeClass('menu_selected');
                    }
                    if(self.$('#income_by_journals').hasClass('menu_selected')){
                        self.$('#income_by_journals').removeClass('menu_selected');
                    }
                    if(self.$('#top_category').hasClass('menu_selected')){
                        self.$('#top_category').removeClass('menu_selected');
                    }
                    if(self.$('#pos_benifit').hasClass('menu_selected')){
                        self.$('#pos_benifit').removeClass('menu_selected');
                    }
                }
                self.get_graph_information();
            });
            this.$('#income_by_journals').click(function(){
                if(!$('#income_by_journals').hasClass('menu_selected')){
                    $('#income_by_journals').addClass('menu_selected');
                    if(self.$('#top_customer').hasClass('menu_selected')){
                        self.$('#top_customer').removeClass('menu_selected');
                    }
                    if(self.$('#top_products').hasClass('menu_selected')){
                        self.$('#top_products').removeClass('menu_selected');
                    }
                    if(self.$('#cashiers').hasClass('menu_selected')){
                        self.$('#cashiers').removeClass('menu_selected');
                    }
                    if(self.$('#sales_by_location').hasClass('menu_selected')){
                        self.$('#sales_by_location').removeClass('menu_selected');
                    }
                    if(self.$('#top_category').hasClass('menu_selected')){
                        self.$('#top_category').removeClass('menu_selected');
                    }
                    if(self.$('#pos_benifit').hasClass('menu_selected')){
                        self.$('#pos_benifit').removeClass('menu_selected');
                    }
                }
                self.get_graph_information();
            });
            this.$('#top_category').click(function(){
                if(!$('#top_category').hasClass('menu_selected')){
                    $('#top_category').addClass('menu_selected');
                    if(self.$('#top_customer').hasClass('menu_selected')){
                        self.$('#top_customer').removeClass('menu_selected');
                    }
                    if(self.$('#top_products').hasClass('menu_selected')){
                        self.$('#top_products').removeClass('menu_selected');
                    }
                    if(self.$('#cashiers').hasClass('menu_selected')){
                        self.$('#cashiers').removeClass('menu_selected');
                    }
                    if(self.$('#income_by_journals').hasClass('menu_selected')){
                        self.$('#income_by_journals').removeClass('menu_selected');
                    }
                    if(self.$('#sales_by_location').hasClass('menu_selected')){
                        self.$('#sales_by_location').removeClass('menu_selected');
                    }
                    if(self.$('#pos_benifit').hasClass('menu_selected')){
                        self.$('#pos_benifit').removeClass('menu_selected');
                    }
                }
                self.get_graph_information();
            });
            this.$('#pos_benifit').click(function(){
                if(!$('#pos_benifit').hasClass('menu_selected')){
                    $('#pos_benifit').addClass('menu_selected');
                    if(self.$('#top_customer').hasClass('menu_selected')){
                        self.$('#top_customer').removeClass('menu_selected');
                    }
                    if(self.$('#top_products').hasClass('menu_selected')){
                        self.$('#top_products').removeClass('menu_selected');
                    }
                    if(self.$('#cashiers').hasClass('menu_selected')){
                        self.$('#cashiers').removeClass('menu_selected');
                    }
                    if(self.$('#sales_by_location').hasClass('menu_selected')){
                        self.$('#sales_by_location').removeClass('menu_selected');
                    }
                    if(self.$('#income_by_journals').hasClass('menu_selected')){
                        self.$('#income_by_journals').removeClass('menu_selected');
                    }
                    if(self.$('#top_category').hasClass('menu_selected')){
                        self.$('#top_category').removeClass('menu_selected');
                    }
                }
                self.get_graph_information();
            });

            /*Bar Chart*/
            this.$('#bar_chart').click(function(){
                var order = self.pos.get_order();
                if($('#bar_chart').hasClass('selected_chart')){
//            		$('#bar_chart').removeClass('selected_chart');
//            		$('#chartContainer').html('');
                }else{
                    $('#bar_chart').addClass('selected_chart');
                    if(self.$('#pie_chart').hasClass('selected_chart')){
                        self.$('#pie_chart').removeClass('selected_chart');
                    }
                    self.get_graph_information();
                    self.bar_chart();
                }
            });
            /*Pie Chart*/
            this.$('#pie_chart').click(function(){
                if($('#pie_chart').hasClass('selected_chart')){
//            		$('#pie_chart').removeClass('selected_chart');
//            		$('#chartContainer').html('');
                }else{
                    $('#pie_chart').addClass('selected_chart');
                    if(self.$('#bar_chart').hasClass('selected_chart')){
                        self.$('#bar_chart').removeClass('selected_chart');
                    }
                    self.get_graph_information();
                    self.pie_chart();
                }
            });
        },
        graph_data: function(from, to, active_chart, category, limit){
            var self = this;
            var current_session_report = self.pos.config.current_session_report;
            var records = rpc.query({
                model: 'pos.order',
                method: 'graph_data',
                args: [from, to, category, limit, self.pos.pos_session.id, current_session_report],
            });
            records.then(function(result){
                var order = self.pos.get_order();
                var dummy_product_ids = self.pos.db.get_dummy_product_ids();
                if(result){
                    if(result.length > 0){
                        if(category == "top_products"){
                            var new_data = [];
                            result.map(function(data){
                                if(($.inArray(data[1], dummy_product_ids) == -1)){
                                    new_data.push(data);
                                }
                            });
                            order.set_result(new_data);
                        }else{
                            order.set_result(result);
                        }
                    }else{
                        order.set_result(0);
                    }
                }else{
                    order.set_result(0);
                }
                if(active_chart == "bar_chart"){
                    self.bar_chart();
                }
                if(active_chart == "pie_chart"){
                    self.pie_chart();
                }
            }).fail(function(error, event) {
                if (error.code === -32098) {
                    self.pos.db.notification('danger',_t("Connectin Lost"));
                    event.preventDefault();
                }
            });
        },
        get_graph_information: function(){
            var self = this;
            var time_period = $('#duration_selection').val();
            var active_chart = $('span.selected_chart').attr('id');
            var category = $('a.menu_selected').attr('id');
            var limit = $('#limit_selection').val() || 10;
            if(time_period == "today"){
                var from = moment(new Date()).locale('en').format('YYYY-MM-DD')+" 00:00:00";
                var to = moment(new Date()).locale('en').format('YYYY-MM-DD HH:mm:ss');
                self.graph_data(from, to, active_chart, category, limit);
            }else if(time_period == "week"){
                var from = moment(moment().startOf('week').toDate()).locale('en').format('YYYY-MM-DD')+" 00:00:00";
                var to   = moment(moment().endOf('week').toDate()).locale('en').format('YYYY-MM-DD')+" 23:59:59";
                self.graph_data(from, to, active_chart, category, limit);
            }else if(time_period == "month"){
                var from = moment(moment().startOf('month').toDate()).locale('en').format('YYYY-MM-DD')+" 00:00:00";
                var to   = moment(moment().endOf('month').toDate()).locale('en').format('YYYY-MM-DD')+" 23:59:59";
                self.graph_data(from, to, active_chart, category, limit);
            }else{
                var from = $('#start_date').val() ? $('#start_date').val() + " 00:00:00" : false;
                var to   = $('#end_date').val() ? $('#end_date').val() + " 23:59:59" : false;
                self.graph_data(from, to, active_chart, category, limit);
            }
        },
    });
    gui.define_screen({name:'graph_view', widget: GraphScreenWidget});

    var GiftCardListScreenWidget = screens.ScreenWidget.extend({
        template: 'GiftCardListScreenWidget',

        init: function(parent, options){
            var self = this;
            this._super(parent, options);
            this.reload_btn = function(){
                $('.gift_reload').toggleClass('rotate', 'rotate-reset');
                self.$el.find('.expiry_date_filter').val('');
                self.$el.find('.issue_date_filter').val('');
                self.$el.find('.Search_giftCard').val('');
                self.date = "all";
                self.reloading_gift_cards();
            };
            if(this.pos.config.iface_vkeyboard && self.chrome.widget.keyboard){
                self.chrome.widget.keyboard.connect(this.$('.searchbox input'));
            }
        },
        events: {
            'click .button.back':  'click_back',
            'keyup .searchbox input': 'search_order',
            'click .searchbox .search-clear': 'clear_search',
            'click .button.create':  'click_create',
            'click .button.reload': 'reload_btn',
            'click #recharge_giftcard': 'click_recharge',
            'click #edit_giftcard': 'click_edit_giftcard',
            'click #exchange_giftcard': 'click_exchange',
        },

        filter:"all",

        date: "all",
        click_back: function(){
            this.gui.back();
        },
        click_create: function(event){
            this.gui.show_popup('create_card_popup');
        },

        click_recharge: function(event){
            var self = this;
            var card_id = parseInt($(event.currentTarget).data('id'));
            var result = self.pos.db.get_card_by_id(card_id);
            var order = self.pos.get_order();
            var client = order.get_client();
            self.gui.show_popup('recharge_card_popup',{
                'card_id':result.id,
                'card_no':result.card_no,
                'card_value':result.card_value,
                'customer_id':result.customer_id
            });
        },

        click_edit_giftcard: function(event){
            var self  = this;
            var card_id = parseInt($(event.currentTarget).data('id'));
            var result = self.pos.db.get_card_by_id(card_id);
            if (result) {
                self.gui.show_popup('edit_card_popup',{'card_id':card_id,'card_no':result.card_no,'expire_date':result.expire_date});
            }
        },

        click_exchange: function(event){
            var self = this;
            var card_id = parseInt($(event.currentTarget).data('id'));
            var result = self.pos.db.get_card_by_id(card_id);
            if (result) {
                self.gui.show_popup('exchange_card_popup',{'card_id':card_id,'card_no':result.card_no});
            }
        },

        search_order: function(event){
            var self = this;
            var search_timeout = null;
            clearTimeout(search_timeout);
            var query = $(event.currentTarget).val();
            search_timeout = setTimeout(function(){
                self.perform_search(query,event.which === 13);
            },70);
        },

        get_gift_cards: function(){
            return this.pos.get('gift_card_order_list');
        },

        show: function(){
            var self = this;
            this._super();
            this.reload_gift_cards();
            this.reloading_gift_cards();
            $('.issue_date_filter').datepicker({
                dateFormat: 'yy-mm-dd',
                autoclose: true,
                closeText: 'Clear',
                showButtonPanel: true,
                onSelect: function (dateText, inst) {
                    var date = $(this).val();
                    if (date){
                        self.date = date;
                        self.render_list(self.get_gift_cards());
                    }
                },
                onClose: function(dateText, inst){
                    if( !dateText ){
                        self.date = "all";
                        self.render_list(self.get_gift_cards());
                    }
                }
           }).focus(function(){
                var thisCalendar = $(this);
                $('.ui-datepicker-close').click(function() {
                    thisCalendar.val('');
                    self.date = "all";
                    self.render_list(self.get_gift_cards());
                });
           });
           $('.expiry_date_filter').datepicker({
                dateFormat: 'yy-mm-dd',
                autoclose: true,
                closeText: 'Clear',
                showButtonPanel: true,
                onSelect: function (dateText, inst) {
                    var date = $(this).val();
                    if (date){
                        self.expire_date = date;
                        self.render_list(self.get_gift_cards());
                    }
                },
                onClose: function(dateText, inst){
                    if( !dateText ){
                        self.expire_date = "all";
                        self.render_list(self.get_gift_cards());
                    }
                }
           }).focus(function(){
                var thisCalendar = $(this);
                $('.ui-datepicker-close').click(function() {
                    thisCalendar.val('');
                    self.expire_date = "all";
                    self.render_list(self.get_gift_cards());
                });
           });
        },

        perform_search: function(query, associate_result){
            var self = this;
            if(query){
                var gift_cards = self.pos.db.search_gift_card(query);
                if ( associate_result && gift_cards.length === 1){
                    this.gui.back();
                }
                this.render_list(gift_cards);
            }else{
                this.render_list(self.get_gift_cards());
            }
        },

        clear_search: function(){
            this.render_list(this.get_gift_cards());
            this.$('.searchbox input')[0].value = '';
            this.$('.searchbox input').focus();
        },

        render_list: function(gift_cards){
            var self = this;
            var contents = this.$el[0].querySelector('.giftcard-list-contents');
            contents.innerHTML = "";
            var temp = [];
            if(self.filter !== "" && self.filter !== "all"){
                gift_cards = $.grep(gift_cards,function(gift_card){
                    return gift_card.state === self.filter;
                });
            }
            if(self.date !== "" && self.date !== "all"){
                var x = [];
                for (var i=0; i<gift_cards.length;i++){
                    var date_expiry = gift_cards[i].expire_date;
                    var date_issue = gift_cards[i].issue_date;
                    if(self.date == date_issue){
                        x.push(gift_cards[i]);
                    }
                }
                gift_cards = x;
            }
            if(self.expire_date !== "" && self.expire_date !== "all"){
                var y = [];
                for (var i=0; i<gift_cards.length;i++){
                    var date_expiry = gift_cards[i].expire_date;
                    var date_issue = gift_cards[i].issue_date;
                    if(self.expire_date == date_expiry){
                        y.push(gift_cards[i]);
                    }
                }
                gift_cards = y;
            }
            for(var i = 0, len = Math.min(gift_cards.length,1000); i < len; i++){
                var gift_card    = gift_cards[i];
                gift_card.amount = parseFloat(gift_card.amount).toFixed(2); 
                var clientline_html = QWeb.render('GiftCardlistLine',{widget: this, gift_card:gift_card});
                var clientline = document.createElement('tbody');
                clientline.innerHTML = clientline_html;
                clientline = clientline.childNodes[1];
                contents.appendChild(clientline);
            }
//            $("table.giftcard-list").simplePagination({
//                previousButtonClass: "btn btn-danger",
//                nextButtonClass: "btn btn-danger",
//                previousButtonText: '<i class="fa fa-angle-left fa-lg"></i>',
//                nextButtonText: '<i class="fa fa-angle-right fa-lg"></i>',
//                perPage: 10
//            });
        },

        reload_gift_cards: function(){
            var self = this;
            this.render_list(self.get_gift_cards());
        },

        reloading_gift_cards: function(){
            var self = this;
            var params = {
                model: 'aspl.gift.card',
                method: 'search_read',
                domain: [['is_active', '=', true]],
            }
            return rpc.query(params, {async: false}).then(function(result){
                self.pos.db.add_giftcard(result);
                self.pos.set({'gift_card_order_list' : result});
                self.date = 'all';
                self.expire_date = 'all';
                self.reload_gift_cards();
                return self.pos.get('gift_card_order_list');
            }).fail(function (error, event){
                if(error.code === 200 && error.data ){    // Business Logic Error, not a connection problem
                    self.gui.show_popup('error-traceback',{
                        message: error.data.message,
                        comment: error.data.debug
                    });
                }else {
                    self.pos.db.notification('danger','Connection lost');
                }
                event.preventDefault();
                var gift_cards = self.pos.get('gift_card_order_list');
                console.error('Failed to send gift card:', gift_cards);
                self.reload_gift_cards();
                return gift_cards
            });
        },
    });
    gui.define_screen({name:'giftcardlistscreen', widget: GiftCardListScreenWidget});

    var GiftVoucherListScreenWidget = screens.ScreenWidget.extend({
        template: 'GiftVoucherListScreenWidget',

        init: function(parent, options){
            var self = this;
            this._super(parent, options);
            this.reload_btn = function(){
                $('.voucher_reload').toggleClass('rotate', 'rotate-reset');
                self.$el.find('#search_voucher_expiry_date').val('');
                self.$el.find('.voucher_search input').val('');
                self.reloading_gift_vouchers();
            };
        },

        filter:"all",

        date: "all",

        start: function(){
            var self = this;
            this._super();
            var gift_vouchers = self.pos.get('gift_voucher_list');
            this.render_list(gift_vouchers);
            this.$('.back').click(function(){
                self.gui.back();
            });
            this.$('.button.create').click(function(){
                self.gui.show_popup('create_gift_voucher');
            });
            $('input#search_voucher_expiry_date').datepicker({
                'dateFormat': 'yy-mm-dd',
               'autoclose': true,
               onSelect: function(dateText) {
                    if(dateText === ""){
                        self.date = "all"
                    }else {
                        self.date = dateText;
                    }
                    self.render_list(gift_vouchers);
                },
            });

            //searchbox
            var search_timeout = null;
            if(this.pos.config.iface_vkeyboard && self.chrome.widget.keyboard){
                self.chrome.widget.keyboard.connect(this.$('.searchbox.voucher_search input'));
            }
            this.$('.searchbox.voucher_search input').on('keyup',function(event){
                clearTimeout(search_timeout);
                var query = this.value;
                search_timeout = setTimeout(function(){
                    self.perform_search(query,event.which === 13);
                },70);
            });
            this.$('.searchbox.voucher_search .search-clear').click(function(){
                self.clear_search();
            });
        },

        show: function(){
            this._super();
            this.reload_gift_vouchers();
        },

        perform_search: function(query, associate_result){
            var self = this;
            if(query){
                var gift_vouchers = self.pos.db.search_gift_vouchers(query);
                if ( associate_result && gift_vouchers.length === 1){
                    this.gui.back();
                }
                this.render_list(gift_vouchers);
            }else{
                var gift_vouchers = self.pos.get('gift_voucher_list');
                this.render_list(gift_vouchers);
            }
        },

        clear_search: function(){
            var gift_cards = this.pos.get('gift_voucher_list');
            this.render_list(gift_cards);
            this.$('.searchbox.voucher_search input')[0].value = '';
            this.$('.searchbox.voucher_search input').focus();
        },

        render_list: function(gift_vouchers){
            if(!gift_vouchers){
                return;
            }
            var self = this;
            var contents = this.$el[0].querySelector('.giftvoucher-list-contents');
            contents.innerHTML = "";
            var temp = [];
            if(self.filter !== "" && self.filter !== "all"){
                gift_vouchers = $.grep(gift_vouchers,function(gift_voucher){
                    return gift_vouchers.state === self.filter;
                });
            }
            if(self.date !== "" && self.date !== "all"){
                var x = [];
                for (var i=0; i<gift_vouchers.length;i++){
                    var date_expiry = gift_vouchers[i].expiry_date;
                    if(self.date === date_expiry){
                        x.push(gift_vouchers[i]);
                    }
                }
                gift_vouchers = x;
            }
            for(var i = 0, len = Math.min(gift_vouchers.length,1000); i < len; i++){
                var gift_voucher    = gift_vouchers[i];
                gift_voucher.amount = parseFloat(gift_voucher.amount).toFixed(2);
                var clientline_html = QWeb.render('GiftVoucherlistLine',{widget: this, gift_voucher:gift_voucher});
                var clientline = document.createElement('tbody');
                clientline.innerHTML = clientline_html;
                clientline = clientline.childNodes[1];
                contents.appendChild(clientline);
            }
//            $("table.giftvoucher-list").simplePagination({
//                previousButtonClass: "btn btn-danger",
//                nextButtonClass: "btn btn-danger",
//                previousButtonText: '<i class="fa fa-angle-left fa-lg"></i>',
//                nextButtonText: '<i class="fa fa-angle-right fa-lg"></i>',
//                perPage: 10
//            });
        },

        reload_gift_vouchers: function(){
            var self = this;
            var gift_vouchers = self.pos.get('gift_voucher_list');
            this.render_list(gift_vouchers);
        },

        reloading_gift_vouchers: function(){
            var self = this;
            var voucher_params = {
                model: 'aspl.gift.voucher',
                method: 'search_read',
                args: [],
            }
            return rpc.query(voucher_params, {async: false}).then(function(result){
                self.pos.db.add_gift_vouchers(result);
                self.pos.set({'gift_voucher_list' : result});
                self.date = 'all';
                self.reload_gift_vouchers();
                return self.pos.get('gift_voucher_list');
            }).fail(function (error, event){
                if(error.code === 200 && error.data ){    // Business Logic Error, not a connection problem
                    self.gui.show_popup('error-traceback',{
                        message: error.data.message,
                        comment: error.data.debug
                    });
                } else {
                    self.pos.db.notification('danger','Connection lost');
                }
                event.preventDefault();
                var gift_vouchers = self.pos.get('gift_voucher_list');
                console.error('Failed to send orders:', gift_cards);
                self.reload_gift_vouchers();
                return gift_vouchers
            });
        },

        renderElement: function(){
            var self = this;
            self._super();
            self.el.querySelector('.button.reload').addEventListener('click',this.reload_btn);
        },
    });
    gui.define_screen({name:'voucherlistscreen', widget: GiftVoucherListScreenWidget});

    var ModifierWidget = PosBaseWidget.extend({
        template: 'ModifierWidget',
        init: function(parent, options){
            var self = this;
            this._super(parent,options);
            this.modifiers = [];
            this.add_modifier = function(){
                var order = self.pos.get_order();
                var selected_modifier_id = $(this).data('modifier-id');
                if(order.get_selected_orderline() && selected_modifier_id){
                    var selected_line = order.get_selected_orderline();
                    var selected_modifier = self.pos.db.get_modifier_by_id(selected_modifier_id);
                    if(selected_modifier){
                        var line_price = 0.00;
                        var line_qty = 0;
                        if(selected_line.get_quantity() > 1){
                            line_price = selected_line.get_unit_price();
                            line_qty = selected_line.get_quantity();
                        }
                        var qty = order.get_remove_toggle() ? -1 : 1;
                        selected_line.set_modifier_line({
                            id: selected_modifier.id,
                            price: selected_modifier.price,
                            product_id: selected_modifier.product_id[0],
                            name:selected_modifier.display_name,
                            consider: true,
                        }, qty);
                        parent.order_widget.orderline_change(selected_line);
                        if(selected_line.get_quantity() > 1){
                            selected_line.set_quantity(1);
                            order.add_product(selected_line.get_product(), {
                                quantity: line_qty - 1,
                                price: line_price,
                                discount: selected_line.get_discount(),
                            });
                        }
                    }
                }
                if(order.get_remove_toggle()){
                    $('.remove_toggle').addClass('mode_selected');
                } else {
                    $('.remove_toggle').removeClass('mode_selected');
                }
            };
            this.remove_toggle = function(){
                var order = self.pos.get_order();
                order.set_remove_toggle(!order.get_remove_toggle());
                if(order.get_remove_toggle()){
                    $(this).addClass('mode_selected');
                } else {
                    $(this).removeClass('mode_selected');
                }
            };
            this.remove_all = function(){
                var order = self.pos.get_order();
                if(order.get_selected_orderline()){
                    order.get_selected_orderline().remove_modifier_line();
                    parent.order_widget.orderline_change(order.get_selected_orderline());
                }
            };
        },
        replace: function($target){
            this.renderElement();
            var target = $target[0];
            target.parentNode.replaceChild(this.el,target);
        },
        _get_modifiers: function(product){
            var self = this;
            this.modifiers = [];
            var unload_modifiers = '';
            if(product && product.modifier_line){
                _.each(product.modifier_line, function(modifier_id){
                    var modifier = self.pos.db.get_modifier_by_id(modifier_id);
                    if(modifier){
                        if(self.pos.db.get_product_by_id(modifier.product_id[0])){
                            self.modifiers.push(modifier);
                        }else{
                            unload_modifiers += modifier.display_name + ', ';
                        }
                    }
                });
                if(unload_modifiers){
                    self.pos.db.notification('danger','Ingredients are not loaded like '+unload_modifiers.slice(0, -2));
                }
            }
        },
        show_modifiers: function(product){
            this._get_modifiers(product);
            this.renderElement();
            $(this.el).removeClass('oe_hidden');
        },
        hide_modifiers: function(product){
            this.renderElement();
            $(this.el).addClass('oe_hidden');
        },
        renderElement: function(){
            var self = this;
            if(self.modifiers && self.modifiers.length > 0){
                var el_str  = QWeb.render(this.template, {widget: this, modifiers: self.modifiers});
                var el_node = document.createElement('div');

                el_node.innerHTML = el_str;
                el_node = el_node.childNodes[1];

                if(this.el && this.el.parentNode){
                    this.el.parentNode.replaceChild(el_node,this.el);
                }
                this.el = el_node;
                var modifier_button = this.el.querySelectorAll('.modifier_button');
                if(modifier_button && modifier_button.length > 0){
                    for(var i = 0; i < modifier_button.length; i++){
                        modifier_button[i].addEventListener('click', this.add_modifier);
                    }
                }
                if(this.el.querySelector('.remove_toggle')){
                    this.el.querySelector('.remove_toggle').addEventListener('click', this.remove_toggle);
                }
                if(this.el.querySelector('.remove_all')){
                    this.el.querySelector('.remove_all').addEventListener('click', this.remove_all);
                }
            }
        },
        get_image_url: function(modifier){
            return window.location.origin + '/web/image?model=product.modifier&field=icon&id='+modifier.id;
        },
        get_product_name: function(modifier){
            var product_tmpl_id = modifier.product_id[0];
            var product_product = this.pos.db.get_product_by_tmpl_id(product_tmpl_id);
        },
    });

    screens.NumpadWidget.include({
        template: 'NumpadWidget01_9',
        start: function() {
            var self = this;
            this._super();
            var customer_display = this.pos.config.customer_display;
            this.$(".input-button").click(function(){
                if(customer_display){
                    self.pos.get_order().mirror_image_data();
                }
            });
            this.$('.remove-item').click(function(){
                if(self.pos.config.enable_modifiers && self.pos.get_cashier().access_modifiers){
                    self.pos.chrome.screens.products.modifier_widget.hide_modifiers();
                }
            });
        },
        clickChangeMode: function(event) {
            var newMode = event.currentTarget.attributes['data-mode'].nodeValue;
            if(newMode == "price" || newMode == "discount"){
                this.user_access(newMode);
                return;
            }else{
                return this.state.changeMode(newMode);
            }
        },
        user_access: function(newMode){
            var self = this;
            if(self.pos.config.authentication_user_ids && self.pos.config.authentication_user_ids.length > 0) {
                var users_pass = [];
                _.each(self.pos.users, function (user) {
                    self.pos.config.authentication_user_ids.map(function (user_id) {
                        if (user.id == user_id) {
                            if (user.pos_security_pin) {
                                users_pass.push(user.pos_security_pin);
                            }
                        }
                    });
                });
                if (users_pass && users_pass.length > 0) {
                    self.ask_password(users_pass, newMode);
                }
            }
        },
        ask_password: function(password, newMode) {
            var self = this;
            var ret = new $.Deferred();
            if (password) {
                this.gui.show_popup('password',{
                    'title': _t('Password ?'),
                    confirm: function(pw) {
                        var flag = false;
                        for (var i = 0; i < password.length; i++){
                            if(password[i] == pw) {
                                flag = true;
                            }
                        }
                        if(flag){
                            self.state.changeMode(newMode)
                        }else{
                            self.gui.show_popup('error_popup',{
                                'title':_t('Contraseña incorrecta.'),
                                'body':_('La contraseña no es correcta.')
                            });
                        }
                    },
                    cancel: function() {
                        if(self.gui.current_screen && self.gui.current_screen.order_widget &&
                        self.gui.current_screen.order_widget.numpad_state){
                            self.gui.current_screen.order_widget.numpad_state.reset();
                        }
                    }
                });
            } else {
                ret.resolve();
            }
            return ret;
        },
        clickDeleteLastChar: function() {
            var order = this.pos.get_order();
            var selected_orderline = order.get_selected_orderline() || false;
            if(selected_orderline && selected_orderline.get_quantity() == 0){
                if(selected_orderline && selected_orderline.get_product() && selected_orderline.get_product().modifier_line.length > 0){
                    this.pos.chrome.screens.products.modifier_widget.hide_modifiers();
                }
            }
            return this.state.deleteLastChar();
        },
    });

    var OutStockProductsScreenWidget = screens.ScreenWidget.extend({
        template: 'OutStockProductsScreenWidget',
        init: function(parent, options){
            var self = this;
            this._super(parent, options);
            this.category = 0;
            self.product_click = function(){
                var prodict_id = $(this).data('product-id');
                if(prodict_id){
                    var product = self.pos.db.get_product_by_id(prodict_id);
                    if(product){
                        if($(this).hasClass('highlight')){
                            $(this).removeClass('highlight');
                            var removeItem = product;
                            self.selected_product = jQuery.grep(self.selected_product, function(value) {
                              return value != removeItem;
                            });
                        } else{
                            $(this).addClass('highlight');
                            self.selected_product.push(product)
                        }
//            			self.gui.show_popup('show_product_popup',{'product':product});
                    }
                }
            };
            self.clear_search_handler = function(event){
                self.clear_search();
                var input = $('.searchbox input');
                input.val('');
                input.focus();
            };
            var search_timeout  = null;
            self.namelist = [];
            _.each(self.pos.db.get_product_namelist(),function(list){
                self.namelist.push(list[1]);
            });
            this.search_handler = function(event){
                $(this).autocomplete({
                    source:self.namelist,
                });
                var searchbox = this;
                if(event.type == "keypress" || event.keyCode === 46 || event.keyCode === 8){
                    clearTimeout(search_timeout);
                    search_timeout = setTimeout(function(){
                        self.perform_search(self.category, searchbox.value, event.which === 13);
                    },70);
                }
            };
        },
        events: {
            'click .button.back':'click_back',
            'click .button.btn_kanban':'click_kanban',
            'click .button.btn_list':'click_list',
            'click .button.btn_create_po':'click_create_po',
            'click .button.btn_receipt':'click_receipt'
        },
        filter:"all",
        date: "all",
        click_back: function(){
            this.gui.show_screen('products');
        },
        click_receipt: function(){
            var self = this;
            var order = self.pos.get_order();
            var list_product;
            order.set_receipt_mode(true);
            if(self.selected_product.length > 0){
                list_product = self.selected_product;
            }else{
                list_product = self.all_products;
            }
            if(list_product.length > 0){
                order.set_product_vals(list_product)
                if (self.pos.config.iface_print_via_proxy) {
                    var data = order.get_product_vals();
                    var receipt = "";
                    receipt = QWeb.render('OutStockProductXmlReceipt', {
                        widget: self,
                        pos: self.pos,
                        order: order,
                        receipt: order.export_for_printing(),
                        location_data: order.get_location_vals(),
                        product_data: data,
                    });
                   self.pos.proxy.print_receipt(receipt);
                   self.selected_product = [];
                }else{
                    self.gui.show_screen('receipt');
                }
            }
        },
        click_create_po: function(){
            var self = this;
            var order = self.pos.get_order();
            if(self.selected_product.length > 0){
                order.set_list_products(self.selected_product);
                this.gui.show_popup('create_purchase_order_popup',{'list_products':self.selected_product});
            } else{
                alert("Please Select Product!");
            }
        },
        start: function(){
            var self = this;
            self._super();
            this.$('.manage_kanban_view').delegate('.out-stock-main-product','click',self.product_click);
        },
        render_products: function(products){
            var order = this.pos.get_order();
            var product;
            var stock_products = [];
            var location_id = $(".select_location_type").val();
            for(var i = 0, len = products.length; i < len; i++){
                product = products[i];
                if(location_id){
                    if(product && !product.is_dummy_product && product.type == 'product'){
                        stock_products.push(product);
                    }
                }else{
                    if(product && !product.is_dummy_product && product.type == 'product' && product.qty_available == 0){
                        stock_products.push(product);
                    }
                }
            }
            order.set_product_vals(stock_products);
            $('.manage_kanban_view').html(QWeb.render('OutStockProductsList',{
                widget: this,
                products: stock_products}));
            $('.manage_list_view').html(QWeb.render('OutStockListView',{
                widget: this,
                products: stock_products}));
        },
        show: function(){
            var self = this;
            this._super();
            if(this.pos.config.iface_vkeyboard && this.chrome.widget.keyboard){
                $(self.el.querySelector('.searchbox input#product_search')).focus(function(){
                    self.chrome.widget.keyboard.connect($(self.el.querySelector('.searchbox input#product_search')));
                });
                $(self.el.querySelector('.searchbox input#category_search')).focus(function(){
                    self.chrome.widget.keyboard.connect($(self.el.querySelector('.searchbox input#category_search')));
                });
            }
            var order = this.pos.get_order();
            var product;
            self.selected_product = [];
            self.all_products = [];
            $(".select_location_type").val("");
//            $('.product.main-product.header').hide();
            var all_products = this.pos.db.get_product_by_category(0)
            for(var i = 0, len = all_products.length; i < len; i++){
                product = all_products[i];
                if(!product.is_dummy_product && product.type == 'product' && product.qty_available == 0){
                    self.all_products.push(product)
                }
            }
            self.chrome.widget.keyboard.connect($(self.el.querySelector('.searchbox input#category_search')));
            self.chrome.widget.keyboard.connect($(self.el.querySelector('.searchbox input#product_search')));
            $('.out_stock_search_category input').val('');
            $('.searchbox input').val('');
            $('.searchbox input').focus();
            $('span.out_stock_category_clear').click(function(e){
                self.clear_search();
                var input = $('.out_stock_search_category input');
                input.val('');
                input.focus();
            });
            $(".select_location").on('change', function() {
                var location_id = $(".select_location_type").val();
                self.all_products = [];
                if(location_id){
                    var params = {
                        model: 'stock.location',
                        method: 'filter_location_wise_product',
                        args: [location_id],
                    }
                    rpc.query(params, {async: false}).then(function(res){
                        if(res){
                            var location_name = Object.keys(res)[0];
                            order.set_location_vals(location_name)
                             _.each(res, function(product_data) {
                                    if(product_data.length > 0){
                                        _.each(product_data, function(product_id) {
                                            var product_data = self.pos.db.get_product_by_id(product_id);
                                            self.all_products.push(product_data)
                                        });
                                    }
                             });
                             self.render_products(self.all_products);
                        }
                    });
                } else{
                    order.set_location_vals();
                    for(var i = 0, len = all_products.length; i < len; i++){
                        product = all_products[i];
                        if(!product.is_dummy_product && product.type == 'product'){
                            self.all_products.push(product)
                        }
                    }
                    self.render_products(self.all_products);
                }
            });
            this.render_products(all_products);
        },
        renderElement: function(){
            var self = this;
            self._super();
            this.el.querySelector('.searchbox input').addEventListener('keypress',this.search_handler);

            this.el.querySelector('.searchbox input').addEventListener('keydown',this.search_handler);

            this.el.querySelector('.search-clear').addEventListener('click',this.clear_search_handler);

            $('.out_stock_search_category input', this.el).keyup(function(e){
                if($(this).val() == ""){
                    var cat = self.pos.db.get_product_by_category(self.pos.db.root_category_id);
                    self.render_products(cat);
                }
                 $('.out_stock_search_category input').autocomplete({
                     source:self.pos.db.get_category_search_list(),
                     select: function(event, select_category){
                         if(select_category.item && select_category.item.id){
                            var cat = self.pos.db.get_product_by_category(select_category.item.id);
                             self.render_products(cat);
                             var input = $('.out_stock_search_category input');
                             input.val(select_category.item.label);
                             input.focus();
                         }
                     },
                 });
                e.stopPropagation();
            });
            $('.out_stock_search_category input', this.el).keypress(function(e){
                $('.out_stock_search_category input').autocomplete({
                    source:self.pos.db.get_category_search_list(),
                    select: function(event, select_category){
                        if(select_category.item && select_category.item.id){
                            var cat = self.pos.db.get_product_by_category(select_category.item.id);
                            self.render_products(cat);
                            var input = $('.out_stock_search_category input');
                            input.val(select_category.item.label);
                            input.focus();
                        }
                    },
                });
                e.stopPropagation();
            });

        },
    // empties the content of the search box
        clear_search: function(){
            var products = this.pos.db.get_product_by_category(0);
            this.render_products(products);
        },
        perform_search: function(category, query, buy_result){
            var products = this.pos.db.get_product_by_category(category);
            if(query){
                products = this.pos.db.search_product(query);
            }
            this.render_products(products);
        },
        click_kanban: function(event){
            $(event.currentTarget).addClass('highlight');
            $('.btn_list').removeClass('highlight');
            $('.out_stock_product_list_view').hide();
            $('.out_stock_product_kanban_view').show();
        },
        click_list: function(event){
            $(event.currentTarget).addClass('highlight');
            $('.btn_kanban').removeClass('highlight');
            $('.out_stock_product_kanban_view').hide();
            $('.out_stock_product_list_view').show();
//        	$('.manage_list_view').html(QWeb.render('OutStockListView',{widget: self,products: self.all_products}));
        },
    });
    gui.define_screen({name:'product-out-of-stock', widget: OutStockProductsScreenWidget});

    var POSDashboardGraphScreenWidget = screens.ScreenWidget.extend({
        template: 'POSDashboardGraphScreenWidget',
        init: function(parent, options){
            this._super(parent, options);
            var self = this;
            this.pie_chart_journal = function(){
                var order = this.pos.get_order();
                var data = order.get_graph_data_journal();
                var dps = [];
                for(var i=0;i<data.length;i++){
                    dps.push({label: data[i].name, y: data[i].sum});
                }
                var chart = new CanvasJS.Chart("chartContainer_journal",
                {
                    zoomEnabled:true,
                    theme: "theme2",
                    data: [{
                        type: "pie",
                        showInLegend: true,
                        toolTipContent: "{y} - #percent %",
                        yValueFormatString: "",
                        legendText: "{indexLabel}",
                        dataPoints: dps
                    }]
                });
                chart.render();
            };
            this.pie_chart_top_product = function(){
                var order = this.pos.get_order();
                var data = order.get_top_product_result();
                var dps = [];
                if(data && data[0]){
                    for(var i=0;i<data.length;i++){
                        dps.push({label: data[i].name, y: data[i].sum});
                    }
                }
                var chart = new CanvasJS.Chart("chartContainer_top_product",
                {
                    zoomEnabled:true,
                    theme: "theme2",
                    data: [{
                        type: "pie",
                        showInLegend: true,
                        toolTipContent: "{y} - #percent %",
                        yValueFormatString: "",
                        legendText: "{indexLabel}",
                        dataPoints: dps
                    }]
                });
                chart.render();
            };
            this.pie_chart_customer = function(){
                var order = this.pos.get_order();
                var data = order.get_customer_summary();
                var dps = [];
                if(data){
                    dps.push({label: "New Customer", y: data.new_client_sale});
                    dps.push({label: "Existing Customer", y: data.existing_client_sale});
                    dps.push({label: "Without Customer", y: data.without_client_sale});
                }
                var chart = new CanvasJS.Chart("chartContainer_based_customer",
                {
                    zoomEnabled:true,
                    theme: "theme2",
                    data: [{
                        type: "pie",
                        showInLegend: true,
                        toolTipContent: "{y} - #percent %",
                        yValueFormatString: "",
                        legendText: "{indexLabel}",
                        dataPoints: dps
                    }]
                });
                chart.render();
            };
            this.bar_chart_hourly = function(){
                var order = this.pos.get_order();
                var data = order.get_hourly_summary();
                var dps = [];
                var dps2 = [];
                if(data && data[0]){
                    for(var i=0;i<data.length;i++){
                        dps.push({label: "("+data[i].date_order_hour[0] + "-" + data[i].date_order_hour[1	]+")", y: data[i].price_total});
                        dps2.push({y: data[i].price_total});
                    }
                }
                var symbol = 'Amount-#######.00';
                var chart = new CanvasJS.Chart("chartContainer_hourly_sale",{
                    width: data && data.length > 10 ? 1200 : 0,
                    dataPointMaxWidth:25,
                    zoomEnabled:true,
                    animationEnabled: true,
                    theme: "theme3",
                    title: {
                        text: "Today Hourly Sales"
                    },
                    axisY: {
                        suffix: "",
                        title:"Amount",
                    },
                     axisX:{
                          title:"Hours",
                          labelAngle: 45,
                          interval:1
                    },
                    legend :{
                        verticalAlign: 'bottom',
                        horizontalAlign: "center"
                    },
                    data: [{
                        type: "column",
                        dataPoints: dps,
                        color:"#008080",
                    },{
                        type: "column",
                        dataPoints: dps2,
                        color:"#008080",
                    }]
                });
                chart.render();
            };
            this.bar_chart_monthly = function(){
                var order = this.pos.get_order();
                var data = order.get_month_summary();
                var dps = [];
                if(data && data[0]){
                    for(var i=0;i<data.length;i++){
                        dps.push({label: data[i].date_order_day +'/'+data[i].date_order_month, y: data[i].price_total});
                    }
                    var symbol = 'Amount-#######.00';
                    var chart = new CanvasJS.Chart("chartContainer_monthly_sale",{
                        width: data && data.length > 10 ? 1200 : 0,
                        dataPointMaxWidth:25,
                        zoomEnabled:true,
                        animationEnabled: true,
                        theme: "theme3",
                        title: {
                            text: "This Month Sales"
                        },axisY: {
                            suffix: "",
                            title:"Amount",
                        },axisX:{
                              title:"Days",
                              interval:1
                        },legend :{
                            verticalAlign: 'bottom',
                            horizontalAlign: "center"
                        },data: [{
                            type: "column",
                            indexLabel:'{y}',
                            xValueType: "dateTime",
                            indexLabelOrientation: "vertical",
                            dataPoints: dps
                        }]
                    });
                    chart.render();
                }
            };
            this.bar_chart_six_month = function(){
                var order = this.pos.get_order();
                var data = order.get_six_month_summary();
                var dps = [];
                if(data && data[0]){
                    for(var i=0;i<data.length;i++){
                        dps.push({x: data[i].date_order_month, y: data[i].price_total});
                    }
                    var symbol = 'Amount-#######.00';
                    var chart = new CanvasJS.Chart("chartContainer_six_month_sale",{
                        width: data && data.length > 10 ? 1200 : 0,
                        dataPointMaxWidth:25,
                        zoomEnabled:true,
                        animationEnabled: true,
                        theme: "theme3",
                        title: {
                            text: "Last 12 Month Sales"
                        },axisY: {
                            suffix: "",
                            title:"Amount",
                        },axisX:{
                              title:"Months",
                              interval:1
                        },legend :{
                            verticalAlign: 'bottom',
                            horizontalAlign: "center"
                        },data: [{
                            type: "column",
                            indexLabel:'{y}',
                            indexLabelOrientation: "vertical",
                            dataPoints: dps
                        }]
                    });
                    chart.render();
                }
            };
            this.bar_chart_active_session_wise_sale = function(){
                var order = this.pos.get_order();
                var data = order.get_active_session_sales();
                var dps = [];
                if(data && data[0]){
                    _.each(data,function(session){
                        dps.push({label: session.pos_session_id[0].display_name, y: session.sum});
                    })
                }
                var chart = new CanvasJS.Chart("chartContainer_session_wise_sale",{
                    width: data && data.length > 10 ? 1200 : 0,
                    dataPointMaxWidth:25,
                    zoomEnabled:true,
                    animationEnabled: true,
                    theme: "theme3",
                    title: {
                        text: "Today's Active Session(s) Sale"
                    },axisY: {
                        suffix: "",
                        title:"Amount",
                    },axisX:{
                        title:"Sessions",
                        interval:3
                    },legend :{
                        verticalAlign: 'bottom',
                        horizontalAlign: "center"
                    },data: [{
                        type: "column",
                        indexLabel:'{y}',
                        indexLabelOrientation: "vertical",
                        dataPoints: dps
                    }]
                });
                chart.render();
            };
            this.bar_chart_closed_session_wise_sale = function(){
                var order = this.pos.get_order();
                var data = order.get_closed_session_sales();
                var dps = [];
                if(data && data[0]){
                    _.each(data,function(session){
                        dps.push({label: session.pos_session_id[0].display_name, y: session.sum});
                    })
                }
                var chart = new CanvasJS.Chart("chartContainer_closed_session_wise_sale",{
                    width: data && data.length > 10 ? 1200 : 0,
                    dataPointMaxWidth:25,
                    zoomEnabled:true,
                    animationEnabled: true,
                    theme: "theme3",
                    title: {
                        text: "Today's Closed Session(s) Sale"
                    },axisY: {
                        suffix: "",
                        title:"Amount",
                    },axisX:{
                        title:"Sessions",
                        interval:3
                    },legend :{
                        verticalAlign: 'bottom',
                        horizontalAlign: "center"
                    },data: [{
                        type: "column",
                        indexLabel:'{y}',
                        indexLabelOrientation: "vertical",
                        dataPoints: dps
                    }]
                });
                chart.render();
            };
        },
        get_graph_information: function(){
            var from = $('#start_date_journal').val() ? $('#start_date_journal').val() + " 00:00:00" : false;
            var to   = $('#end_date_journal').val() ? $('#end_date_journal').val() + " 23:59:59" : false;
            this.graph_data_journal(from,to);
        },
        get_top_product_graph_information: function(){
            var from = $('#start_date_top_product').val() ? $('#start_date_top_product').val() + " 00:00:00" : false;
            var to   = $('#end_date_top_product').val() ? $('#end_date_top_product').val() + " 23:59:59" : false;
            this.graph_data_top_product(from,to);
        },
        get_sales_by_user_information: function(){
            var from = $('#start_date_sales_by_user').val() ? $('#start_date_sales_by_user').val() + " 00:00:00" : false;
            var to   = $('#end_date_sales_by_user').val() ? $('#end_date_sales_by_user').val() + " 23:59:59" : false;
            this.sales_by_user(from,to)
        },
        render_journal_list: function(journal_data){
            var contents = this.$el[0].querySelector('.journal-list-contents');
            contents.innerHTML = "";
            for(var i = 0, len = Math.min(journal_data.length,1000); i < len; i++){
                var journal = journal_data[i];
                var journal_html = QWeb.render('JornalLine',{widget: this, journal:journal_data[i]});
                var journalline = document.createElement('tbody');
                journalline.innerHTML = journal_html;
                journalline = journalline.childNodes[1];
                contents.appendChild(journalline);
            }
        },
        render_top_product_list: function(top_product_list){
            var contents = this.$el[0].querySelector('.top-product-list-contents');
            contents.innerHTML = "";
            for(var i = 0, len = Math.min(top_product_list.length,1000); i < len; i++){
                var top_product = top_product_list[i];
                var top_product_html = QWeb.render('TopProductLine',{widget: this, top_product:top_product_list[i]});
                var top_product_line = document.createElement('tbody');
                top_product_line.innerHTML = top_product_html;
                top_product_line = top_product_line.childNodes[1];
                contents.appendChild(top_product_line);
            }
        },
        graph_data_journal: function(from, to){
            var self = this;
            rpc.query({
                model: 'pos.order',
                method: 'graph_date_on_canvas',
                args: [from, to]
            },{async:false}).then(
                function(result) {
                    var order = self.pos.get_order();
                    if(result){
                        self.render_journal_list(result)
                        if(result.length > 0){
                            order.set_graph_data_journal(result);
                        }else{
                            order.set_graph_data_journal(0);
                        }
                    }else{
                        order.set_graph_data_journal(0);
                    }
                    self.pie_chart_journal();
                }).fail(function(error, event) {
                if (error.code === -32098) {
                    alert("Server closed...");
                    event.preventDefault();
                }
            });
        },
        graph_data_top_product: function(from, to){
            var self = this;
            rpc.query({
                model: 'pos.order',
                method: 'graph_best_product',
                args: [from, to]
            },{async:false}).then(
                function(result) {
                    var order = self.pos.get_order();
                    if(result){
                        self.render_top_product_list(result)
                        if(result.length > 0){
                            order.set_top_product_result(result);
                        }else{
                            order.set_top_product_result(0);
                        }
                    }else{
                        order.set_top_product_result(0);
                    }
                    self.pie_chart_top_product();
                }).fail(function(error, event) {
                if (error.code === -32098) {
                    alert("Server closed...");
                    event.preventDefault();
                }
            });
        },
        sales_by_user: function(from, to){
            var self = this;
            rpc.query({
                model: 'pos.order',
                method: 'orders_by_salesperson',
                args: [from,to]
            },{async:false}).then(function(result) {
                if(result){
                    self.render_user_wise_sales(result)
                }
            });
        },
        sales_from_session: function(){
            var self = this;
            rpc.query({
                model: 'pos.order',
                method: 'session_details_on_canvas',
            },{async:false}).then(function(result) {
                if(result){
                    if(result){
                        if(result.active_session && result.active_session[0]){
                            self.pos.get_order().set_active_session_sales(result.active_session);
                        }
                        if(result.close_session && result.close_session[0]){
                            self.pos.get_order().set_closed_session_sales(result.close_session)
                        }
                    }
                }
            });
        },
        render_user_wise_sales: function(sales_users){
            var contents = this.$el[0].querySelector('.user-wise-sales-list-contents');
            contents.innerHTML = "";
            for(var i = 0, len = Math.min(sales_users.length,1000); i < len; i++){
                var user_data = sales_users[i];
                var user_sales_html = QWeb.render('UserSalesLine',{widget: this, user_sales:sales_users[i]});
                var user_sales_line = document.createElement('tbody');
                user_sales_line.innerHTML = user_sales_html;
                user_sales_line = user_sales_line.childNodes[1];
                contents.appendChild(user_sales_line);
            }
        },
        show: function(){
            var self = this;
            this._super();
            this.$('.back').click(function(){
                self.gui.show_screen('products');
            });
            var today = moment().locale('en').format("YYYY-MM-DD");
            $("#start_date_journal").val(today);
            $("#end_date_journal").val(today);
            $("#start_date_top_product").val(today);
            $("#end_date_top_product").val(today);
            $("#start_date_sales_by_user").val(today);
            $("#end_date_sales_by_user").val(today);
            var start_date = false;
            var end_date = false;
            var active_chart = $('span.selected_chart').attr('id');
            $("#start_date_journal").datepicker({
                dateFormat: 'yy-mm-dd',
                autoclose: true,
                closeText: 'Close',
                showButtonPanel: true,
                onSelect: function(dateText, inst) {
                    start_date = dateText;
                    var active_chart = $('span.selected_chart').attr('id');
                    self.graph_data_journal(start_date, end_date);
                },
            });
            $("#end_date_journal").datepicker({
                dateFormat: 'yy-mm-dd',
                autoclose: true,
                closeText: 'Close',
                showButtonPanel: true,
                onSelect: function(dateText, inst) {
                    end_date = dateText;
                    var active_chart = $('span.selected_chart').attr('id');
                    self.graph_data_journal(start_date, end_date);
                },
            });
            $("#start_date_top_product").datepicker({
                dateFormat: 'yy-mm-dd',
                autoclose: true,
                closeText: 'Close',
                showButtonPanel: true,
                onSelect: function(dateText, inst) {
                    start_date = dateText;
                    var active_chart = $('span.selected_chart').attr('id');
                    self.graph_data_top_product(start_date, end_date);
                },
            });
            $("#end_date_top_product").datepicker({
                dateFormat: 'yy-mm-dd',
                autoclose: true,
                closeText: 'Close',
                showButtonPanel: true,
                onSelect: function(dateText, inst) {
                    end_date = dateText;
                    var active_chart = $('span.selected_chart').attr('id');
                    self.graph_data_top_product(start_date, end_date);
                },
            });
            $("#start_date_sales_by_user").datepicker({
                dateFormat: 'yy-mm-dd',
                autoclose: true,
                closeText: 'Close',
                showButtonPanel: true,
                onSelect: function(dateText, inst) {
                    start_date = dateText;
                    self.sales_by_user(start_date,end_date)
                },
            });
            $("#end_date_sales_by_user").datepicker({
                dateFormat: 'yy-mm-dd',
                autoclose: true,
                closeText: 'Close',
                showButtonPanel: true,
                onSelect: function(dateText, inst) {
                    end_date = dateText;
                    self.sales_by_user(start_date,end_date)
                },
            });
            rpc.query({
                model: 'pos.order',
                method: 'get_dashboard_data',
                args: []
            },{async:false}).then(function(result) {
                self.pos.dashboard_data = result;
                if(result){
                    $('#total_active_session').text(result['active_sessions'])
                    $('#total_closed_session').text(result['closed_sessions'])
                    $('#total_sale_count').text(result['total_orders']);
                    $('#total_sale_amount').text(self.chrome.format_currency(result['total_sales']));
                    var order = self.pos.get_order();
                    order.set_hourly_summary(result['sales_based_on_hours']);
                    order.set_month_summary(result['current_month']);
                    order.set_six_month_summary(result['last_6_month_res']);
                    order.set_customer_summary(result['client_based_sale']);
                    self.get_graph_information();
                    self.get_top_product_graph_information();
                    self.get_sales_by_user_information();
                    self.pie_chart_journal();
                    self.pie_chart_top_product();
                    self.bar_chart_hourly();
                    self.bar_chart_monthly();
                    self.bar_chart_six_month();
                    self.pie_chart_customer();
                    self.sales_from_session();
//        			self.bar_chart_active_session_wise_sale();
//        			self.bar_chart_closed_session_wise_sale();
                }
            });
        },
    });
    gui.define_screen({name:'pos_dashboard_graph_view', widget: POSDashboardGraphScreenWidget});

    var CustomerCreditListScreenWidget = screens.ScreenWidget.extend({
        template: 'CustomerCreditListScreenWidget',
        get_customer_list: function(){
            return this.pos.get('customer_credit_list');
        },
        show: function(options){
            var self = this;
            this.reloading_orders(this.get_cust_id());
            self.date = "all";
            var records = self.pos.get('customer_credit_list');
            this._super();
            self.render_list(records);
            if(records){
                var partner = this.pos.db.get_partner_by_id(this.get_cust_id());
                self.display_client_details(partner);
            }
            $('.back').click(function(){
                self.gui.show_screen('clientlist');
            })
            self.reload_orders();
            this.$('.print-ledger').click(function(){
                var order = self.pos.get_order();
                order.set_ledger_click(true);
                self.gui.show_popup('cash_inout_statement_popup');
            });
            $('input#datepicker').datepicker({
                dateFormat: 'yy-mm-dd',
                autoclose: true,
                closeText: 'Clear',
                showButtonPanel: true,
                onSelect: function (dateText, inst) {
                    var date = $(this).val();
                    if (date){
                        self.date = date;
                        self.render_list(self.get_customer_list());
                    }
                },
                onClose: function(dateText, inst){
                    if( !dateText ){
                        self.date = "all";
                        self.render_list(self.get_customer_list());
                    }
                },
            }).focus(function(){
                var thisCalendar = $(this);
                $('.fa-times, .ui-datepicker-close').click(function() {
                    thisCalendar.val('');
                    self.date = "all";
                    self.render_list(self.get_customer_list());
                });
            });
            var old_goToToday = $.datepicker._gotoToday
            $.datepicker._gotoToday = function(id) {
                old_goToToday.call(this,id)
                this._selectDate(id)
            }
        },
        check_date_filter: function(records){
            var self = this;
            if(self.date !== "" && self.date !== "all"){
                var date_filtered_records = [];
                for (var i=0; i<records.length;i++){
                    var date_record = $.datepicker.formatDate("yy-mm-dd",new Date(records[i].create_date));
                    if(self.date === date_record){
                        date_filtered_records.push(records[i]);
                    }
                }
                records = date_filtered_records;
            }
            return records;
        },
        render_list: function(records){
            var self = this;
            if(records && records.length > 0){
                var contents = this.$el[0].querySelector('.credit-list-contents');
                contents.innerHTML = "";
                if(self.date !== "" && self.date !== "all"){
                    records = self.check_date_filter(records);
                }
                for(var i = 0, len = Math.min(records.length,1000); i < len; i++){
                    var self = this;
                    var record    = records[i];
                    var clientline_html = QWeb.render('CreditlistLine',{widget: this, record:record});
                    var clientline = document.createElement('tbody');
                    clientline.innerHTML = clientline_html;
                    clientline = clientline.childNodes[1];
                    contents.appendChild(clientline);
                }
            } else{
                var contents = this.$el[0].querySelector('.credit-list-contents');
                contents.innerHTML = "Record Not Found";
                $("#pagination").hide();
            }
        },
        get_cust_id: function(){
            return this.gui.get_current_screen_param('cust_id');
        },
        reloading_orders: function(cust_id){
            var self = this;
            var partner = self.pos.db.get_partner_by_id(cust_id);
            var domain = []
            if(partner){
                if(partner.parent_id){
                    partner = self.pos.db.get_partner_by_id(partner.parent_id[0]);
                    domain.push(['partner_id','=',partner.id])
                } else{
                    partner = self.pos.db.get_partner_by_id(cust_id)
                    domain.push(['partner_id','=',partner.id])
                }
                var today = new Date();
                var end_date = moment(today).locale('en').format('YYYY-MM-DD');
                var client_acc_id = partner.property_account_receivable_id;
                domain.push(['account_id','=',client_acc_id[0]],['date_maturity', '<=', end_date + " 23:59:59"]);
                var params = {
                    model: "account.move.line",
                    method: "search_read",
                    domain: domain,
                }
                rpc.query(params, {async: false})
                .then(function(records){
                    self.pos.set({'customer_credit_list' : records});
                    self.reload_orders();
                    return self.pos.get('customer_credit_list')
                });
            }
        },
        reload_orders: function(){
            var self = this;
            var records = self.pos.get('customer_credit_list');
            this.search_list = []
            _.each(self.pos.partners, function(partner){
                self.search_list.push(partner.name);
            });
            _.each(records, function(record){
                self.search_list.push(record.display_name)
            });
            records = records.sort().reverse();
            this.render_list(records);
        },
        line_select: function(event,$line,id){
            var partner = this.pos.db.get_partner_by_id(id);
            this.$('.credit-list .lowlight').removeClass('lowlight');
                this.$('.credit-list .highlight').removeClass('highlight');
                $line.addClass('highlight');
                this.new_client = partner;
        },
        load_image_file: function(file, callback){
            var self = this;
            if (!file.type.match(/image.*/)) {
                this.gui.show_popup('error',{
                    title: _t('Unsupported File Format'),
                    body:  _t('Only web-compatible Image formats such as .png or .jpeg are supported'),
                });
                return;
            }

            var reader = new FileReader();
            reader.onload = function(event){
                var dataurl = event.target.result;
                var img     = new Image();
                img.src = dataurl;
                self.resize_image_to_dataurl(img,800,600,callback);
            };
            reader.onerror = function(){
                self.gui.show_popup('error',{
                    title :_t('Could Not Read Image'),
                    body  :_t('The provided file could not be read due to an unknown error'),
                });
            };
            reader.readAsDataURL(file);
        },
        display_client_details: function(partner, clickpos){
            var self = this;
            var contents = this.$('.credit-details-contents');
            contents.empty();
            var parent   = this.$('.order-list').parent();
            var scroll   = parent.scrollTop();
            var height   = contents.height();
//            var partner = Number($('.client-line.highlight').attr('data-id'));
            contents.append($(QWeb.render('CustomerCreditDisplay',{widget:this, partner: partner})));
            var new_height   = contents.height();
            if(!this.details_visible){
                parent.height('-=' + new_height);
                if(clickpos < scroll + new_height + 20 ){
                    parent.scrollTop( clickpos - 20 );
                }else{
                    parent.scrollTop(parent.scrollTop() + new_height);
                }
            }else{
                parent.scrollTop(parent.scrollTop() - height + new_height);
            }
            this.details_visible = true;
        },
        partner_icon_url: function(id){
            return '/web/image?model=res.partner&id='+id+'&field=image_small';
        },
    });
    gui.define_screen({name:'customercreditlistscreen', widget: CustomerCreditListScreenWidget});

    // Kitchen Screen
    var kitchenScreenWidget = screens.ScreenWidget.extend({
        template: 'kitchenScreenWidget',
        init: function(parent, options){
            var self = this;
            this._super(parent, options);
            this.categ_id = 0;
            this.category_list = [];
            this.config_categ_ids = [];
            this.scroll_position = 0;
            var cashier = self.pos.get_cashier() || self.pos.user;
            if(_.contains(['cook','cook_manager'], cashier.user_role)){
                rpc.query({
                    model: 'res.users',
                    method: 'get_pos_child_categ_ids',
                    args: [cashier.id],
                },{async: false}).then(function(result){
                    if(result && result[0]){
                        self.config_categ_ids = result;
                    }
                });
            }
            this.config_categ_ids.map(function(id){
                var object = self.pos.db.get_category_by_id(id);
                self.category_list.push(object);
            });
        },
        show: function() {
            this._super();
            var self = this;
            this.categ_id = 0;
            this.renderElement();
//        	if(self.pos.user.user_role === 'cook'){
//                this.categ_id = self.pos.user.pos_category_ids[0];
//                this.$el.find('span.category:first').addClass('selected');
//            }
            this.pos.mirror_kitchen_orders();
            if(self.pos.user.user_role == 'cook'){
                $('.order-list,.kitchen-buttons').addClass('disappear');
                $('.order-kanban').removeClass('disappear');
                $('.kitchen-screen').find('.top-content').hide();
            }
            $('.kitchen-screen.screen .button.btn-kanban').trigger('click');
        },
        render_screen_order_lines: function(screen_data){
            if(screen_data){
                screen_data = _.sortBy(screen_data, 'order');
                var contents = this.$el[0].querySelector('.order-list-contents');
                contents.innerHTML = "";
                for(var i = 0, len = Math.min(screen_data.length,1000); i < len; i++){
                    var order_line_data    = screen_data[i];
                    var orderline_html = QWeb.render('KitchenOrderlistLine',{widget: this, order_line_data:order_line_data});
                    var orderlines = document.createElement('div');
                    orderlines.innerHTML = orderline_html;
                    orderlines = orderlines.childNodes[1];
                    contents.appendChild(orderlines);
                }
            }
            $('.kitchen-screen-view').scrollTop(self.scroll_position);
        },
        render_table_data: function(table_data){
            var self = this;
            if(table_data){
                table_data = _.sortBy(table_data, 'order_id');
                var contents = this.$el[0].querySelector('.table-order-contents');
                contents.innerHTML = "";
                for(var i = 0, len = Math.min(table_data.length,1000); i < len; i++){
                    var order_data = table_data[i];
                    order_data.order_lines = _(order_data.order_lines).filter(function(line) {
                        if(_.contains(self.config_categ_ids, line.categ_id) && line.state != 'done'){
                            var record = _.find(self.category_list, function(c_list){
                                return c_list.id === line.categ_id;
                            });
                            if(_.contains(self.config_categ_ids, line.categ_id) && line.state != 'done' && record){
                                return line;
                            }
                        }
                    });
                    if(order_data.order_lines.length > 0){
                        order_data['grouped_data'] = _.groupBy(order_data.order_lines, 'priority');
                        var order_html = QWeb.render('TableOrders',{widget: this, order_data:order_data});
                        var order = document.createElement('div');
                        order.innerHTML = order_html;
                        order = order.childNodes[1];
                        if(order){
                            contents.appendChild(order);
                            if (!(order_data.order_id in this.pos.kitchen_order_timer)){
                                if(order_data.est_ordertime > 0){
                                    this.countdown(order_data.order_id,order_data.est_ordertime)
                                }else{
                                    var element = document.getElementById(order_data.order_id.toString());
                                    $(element).parent().hide();
                                }
                            } else{
                                var time_sec = this.pos.kitchen_order_timer[order_data.order_id].time.split(':')
                                this.countdown(order_data.order_id,Number(time_sec[0]),Number(time_sec[1]))
                            }
                        }
                    }
                }
            }
            $('.kitchen-screen-view').scrollTop(self.scroll_position);
        },
        countdown: function(elementName, minutes, seconds){
            var self = this;
            seconds = seconds ? seconds : 0
            var element, endTime, hours, mins, msLeft, time;
            function twoDigits( n ){
                return (n <= 9 ? "0" + n : n);
            }
            function updateTimer(){
                msLeft = endTime - (+new Date);
                if ( msLeft < 1000 ) {
                    element.innerHTML = "Order time is over!";
                    var ele = $("[data-pos-order-id='"+ element.id +"']")
                    ele.css('background','#ffbaba');
                } else {
                    time = new Date( msLeft );
                    hours = time.getUTCHours();
                    mins = time.getUTCMinutes();
                    var run_time = (hours ? hours + ':' + twoDigits( mins ) : mins) + ':' + twoDigits( time.getUTCSeconds() );
                    if(element){
                        element.innerHTML = run_time;
                    }
                    if (!(element.id in self.pos.kitchen_order_timer)){
                        self.pos.kitchen_order_timer[element.id] = {'time':run_time};
                    } else{
                        self.pos.kitchen_order_timer[element.id].time = run_time
                    }
                    setTimeout( updateTimer, time.getUTCMilliseconds() + 500 );
                }
            }
            element = document.getElementById( elementName.toString() );
            endTime = (+new Date) + 1000 * (60*minutes + seconds) + 500;
            updateTimer();
        },
        events:{
            'click .button.back':  'click_back',
            'click div.kitchen-buttons span.category':'click_categ_button',
            'click div.state-button ':'change_state_click',
            'click div.cancel-order ':'cancel_order_click',
            'click span#view_note ':'show_order_note',
            'click .btn-list':'list_view_click',
            'click .btn-kanban':'kanban_view_click',
            'click .kitchen-order-note':'show_order_note',
            'click .order-print-receipt':'order_print_receipt',
        },
        click_back: function(){
            this.gui.back();
        },
        list_view_click: function(event){
            $(event.currentTarget).addClass('selected');
            $('.btn-kanban').removeClass('selected');
            $('.order-list,.kitchen-buttons').removeClass('disappear');
            $('.order-kanban').addClass('disappear');
        },
        kanban_view_click: function(event){
            $(event.currentTarget).addClass('selected');
            $('.btn-list').removeClass('selected');
            $('.order-list,.kitchen-buttons').addClass('disappear');
            $('.order-kanban').removeClass('disappear');
        },
        show_order_note:function(event){
            var self = this;
            var note = $(event.currentTarget).data('note');
            self.gui.show_popup('kitchen_line_note_popup',{'note':note});
        },
        click_categ_button: function(event){
            var self = this;
            this.categ_id = parseInt($(event.currentTarget).data('id'));
            $('span.category').removeClass('selected');
            $(event.currentTarget).addClass('selected');
            var screen_data = [];
            _.each(self.pos.get('screen_data'),function(line){
                if(self.categ_id == 0){
                    var record = _.find(self.category_list, function(c_list){
                        return c_list.id === line.categ_id;
                    });
                    if(record){
                        screen_data.push(line);
                    }
                }else if(line.categ_id && line.categ_id == self.categ_id){
                     screen_data.push(line);
                }
            });
            self.render_screen_order_lines(screen_data);
        },
        change_state_click:function(event){
            var self = this;
            var state_id = $(event.currentTarget).data('state');
            var order_line_id = parseInt($(event.currentTarget).data('id'));
            var order_id = parseInt($(event.currentTarget).data('order-id'));
            var route = $(event.currentTarget).data('route');
            var $el = $('[data-pos-order-id="'+order_id+'"].order-container');
            self.scroll_position = Number($('.kitchen-screen-view').scrollTop()) || 0;
            $el.addClass('show_loading');
            if(route){
                if(state_id == 'waiting'){
                    rpc.query({
                        model: 'pos.order.line',
                        method: 'update_orderline_state',
                        args: [{'state': 'preparing','order_line_id':order_line_id}],
                    },{async: false}).then(function(result){
                        if(result){
                            self.pos.mirror_kitchen_orders();
                        }
                    });
                }else if(state_id == 'preparing'){
                    rpc.query({
                        model: 'pos.order.line',
                        method: 'update_orderline_state',
                        args: [{'state': 'delivering','order_line_id':order_line_id}],
                    },{async: false}).then(function(result) {
                        if(result){
                            self.pos.mirror_kitchen_orders();
                         }
                    });
                }else if(state_id == 'delivering'){
                    rpc.query({
                        model: 'pos.order.line',
                        method: 'update_orderline_state',
                        args: [{'state': 'done','order_line_id':order_line_id}],
                    },{async: false}).then(function(result) {
                        if(result){
                            self.pos.mirror_kitchen_orders();
                        }
                    });
                }
            }else{
                if(state_id == 'waiting'){
                    rpc.query({
                        model: 'pos.order.line',
                        method: 'update_orderline_state',
                        args: [{'state': 'delivering','order_line_id':order_line_id}],
                    },{async: false}).then(function(result) {
                        if(result){
                            self.pos.mirror_kitchen_orders();
                         }
                    });
                }else if(state_id == 'delivering'){
                    rpc.query({
                        model: 'pos.order.line',
                        method: 'update_orderline_state',
                        args: [{'state': 'done','order_line_id':order_line_id}],
                    },{async: false}).then(function(result) {
                        if(result){
                            self.pos.mirror_kitchen_orders();
                        }
                    });
                }
            }
        },
        cancel_order_click:function(event){
            var self = this;
            var order_line_id = parseInt($(event.currentTarget).data('id'));
            if(order_line_id){
                rpc.query({
                    model: 'pos.order.line',
                    method: 'update_orderline_state',
                    args: [{'state': 'cancel','order_line_id':order_line_id}],
                },{async: false}).then(function(result){
                    if(result){
                        self.pos.mirror_kitchen_orders();
                    }
                });
            }
        },
        order_print_receipt: function(ev){
            var self = this;
            var order_id = $(ev.currentTarget).data('pos-order-id');
            if(order_id){
                rpc.query({
                    model: 'pos.order',
                    method: 'load_order_details',
                    args: [order_id],
                },{async:false}).done(function(lines) {
                    if(lines && lines[0]){
                        var receipt = QWeb.render('KitchenLineReceipt', {
                            widget: self,
                            lines:lines,
                        });
                        self.pos.proxy.print_receipt(receipt);
                    }
                });
            }
        },
//        renderElement:function(){
//            this._super();
//            var self = this;
//            $('.kitchen-screen-view').scrollTop(this.scroll_position);
//        },
    });
    gui.define_screen({name:'kitchen_screen', widget: kitchenScreenWidget});

//     Delivery details Screen
//	var DeliveryDetailsScreenWidget = screens.ScreenWidget.extend({
//        template: 'DeliveryDetailsScreenWidget',
//        events:{
//	        'click .button.back':  'click_back',
//	        'click #change_deliver_state':'change_deliver_state',
//	        'click #change_delivery_user':'change_delivery_user',
//	        'click .reload_delivery_orders':'reload_delivery_orders'
//        },
//        init: function(parent, options){
//            var self = this;
//            this._super(parent, options);
//            this.pos_orders = [];
//        },
//        show: function() {
//        	this._super();
//        	this.load_delivery_orders();
//        },
//        click_back: function(){
//        	this.gui.back();
//        },
//        change_deliver_state: function(event){
//        	var self = this;
//        	var order_id = $(event.currentTarget).data('id');
//        	var delivery_state = $(event.currentTarget).data('delivery-state');
//        	var order_state = $(event.currentTarget).data('order-state');
//        	if(order_state != 'draft'){
//        		if(order_id){
//            		if(delivery_state == 'pending'){
//            			var params = {
//        		    		model: 'pos.order',
//        		    		method: 'change_delivery_state',
//        		    		args: [order_id, 'delivered'],
//        		    	}
//        		    	rpc.query(params, {async: false})
//        		    	.then(function(result){
//        		    		if(result){
//        		    			self.pos.db.notification('success','Order delivered successful!');
//        		    			self.load_delivery_orders();
//        		    			var statements = [];
//        		    			if(result.statement_ids.length > 0){
//        		    				statements = self.get_journal_from_order(result.statement_ids);
//        		                }
//        		    			result['statements'] = statements;
//        		    			self.pos.get_order().set_delivery_payment_data(result);
//        		    			self.pos.gui.show_screen('receipt');
//        		    		}else{
//        		    			self.pos.db.notification('danger','Process incompleted!');
//        		    		}
//        		    	});
//            		}
//            	}else{
//            		alert("Order id not found!");
//            	}
//        	}else{
//        		self.pos.gui.show_popup('delivery_payment_popup',{'order_id':order_id, 'pos_orders':self.pos_orders});
//        	}
//        },
//        get_journal_from_order: function(statement_ids){
//	    	var self = this;
//	    	var params = {
//	    		model: 'account.bank.statement.line',
//	    		method: 'search_read',
//	    		domain: [['id', 'in', statement_ids]],
//	    	}
//	    	var order_statements = [];
//	    	rpc.query(params, {async: false}).then(function(statements){
//	    		if(statements.length > 0){
//	    			_.each(statements, function(statement){
//	    				if(statement.amount > 0){
//	    					order_statements.push({
//	    						amount: statement.amount,
//	    						journal: statement.journal_id[1],
//	    					});
//	    				}
//	    			});
//	    		}
//	    	}).fail(function(){
//            	self.pos.db.notification('danger',"Connection lost");
//            });
//	    	return order_statements;
//	    },
//        change_delivery_user: function(event){
//        	var delivery_user_id = $(event.currentTarget).data('delivery-user-id');
//        	var order_id = $(event.currentTarget).data('id');
//        	this.pos.gui.show_popup('change_delivery_user_popup',{'delivery_user_id':delivery_user_id, 'order_id':order_id});
//        },
//        reload_delivery_orders: function(){
//        	$('.reload_order').toggleClass('rotate', 'rotate-reset');
//        	this.load_delivery_orders();
//        },
//        load_delivery_orders: function(){
//        	var self = this;
//        	var params = {
//	    		model: 'pos.order',
//	    		method: 'ac_pos_search_read',
//	    		args: [{'domain': [['delivery_type','=','pending']]}],
//	    	}
//	    	rpc.query(params, {async: false})
//	    	.then(function(orders){
//	    		self.render_delivery_data(orders);
//	    	})
//	    	.fail(function(){
//            	self.pos.db.notification('danger',"Connection lost");
//            });
//        },
//        render_delivery_data: function(orders){
//	    	var self = this;
//	    	var contents = $('.kanban-delivery-orders');
//            contents.empty();
//	        if(orders){
//	        	orders = _.sortBy(orders, 'id');
//	        	this.pos_orders = orders;
//	            for(var i = 0, len = Math.min(orders.length,1000); i < len; i++){
//	                var order = orders[i];
////	            	var order_html = QWeb.render('DeliveryOrderlistLine',{widget: this, order:order});
//	                var order_html = QWeb.render('DeliveryOrderViews',{widget: this, order:order});
//	            	contents.append(order_html);
//	            }
//	        }else{
//	        	this.pos_orders = [];
//	        	contents.append('');
//	        }
//	    },
//	});
//    gui.define_screen({name:'delivery_details_screen', widget: DeliveryDetailsScreenWidget});

    var add_multistore_button = screens.ActionButtonWidget.extend({
        template: 'AddMultiStoreButton',
        button_click: function(){
            var self = this;
            var user_stores = self.pos.get_cashier().shop_ids;
            var store_list = [];
            _.each(user_stores, function(id){
                var store = self.pos.store_by_id[id]
                if(store){store_list.push(store);}
            });
            if(store_list.length != 0) {
                self.gui.show_popup('multi_shop_popup',{'cashier_store':store_list});
            } else{
                alert("You have no access rights for select Shop!");
            }
        },
    });

    screens.define_action_button({
        'name': 'multistorebutton',
        'widget': add_multistore_button,
        'condition': function(){
            return this.pos.get_cashier()
                && this.pos.get_cashier().shop_ids
                && this.pos.get_cashier().shop_ids[0]
                && this.pos.get_cashier().allow_switch_store;
        },
    });

    splitbill.prototype.button_click = function(){
        var self = this;
        var order = this.pos.get_order();
        if(order.get_orderlines().length > 0){
            if(order.get_discount_product_id() && order.get_order_total_discount() > 0){
                self.gui.show_popup('confirm',{
                    'title': _t('Promotion Remove?'),
                    'body':  _t('Promotion will not applicable during split payment.'),
                    confirm: function(){
                        self.gui.show_screen('splitbill');
                    },
                });
            }else{
                this.gui.show_screen('splitbill');
            }
        }
    };

//	var SelectVariantScreen = screens.ScreenWidget.extend({
//        template:'SelectVariantScreen',
//
//        init: function(parent, options){
//            this._super(parent, options);
//        },
//        start: function(){
//        	this._super();
//            var self = this;
//            // Define Variant Widget
//            this.variant_list_widget = new VariantListWidget(this,{});
//            this.variant_list_widget.replace(this.$('.placeholder-VariantListWidget'));
//
//            // Define Attribute Widget
//            this.attribute_list_widget = new AttributeListWidget(this,{});
//            this.attribute_list_widget.replace(this.$('.placeholder-AttributeListWidget'));
//
////            if(self.pos.config.enable_modifiers && self.pos.get_cashier().access_modifiers){
////            	self.modifier_widget = new ModifierWidget(this);
////            	self.modifier_widget.replace(this.$('.placeholder-ModifierWidget'));
////            }
//            
//            // Add behaviour on Cancel Button
//            this.$('#variant-popup-cancel').off('click').click(function(){
//            	self.gui.back();
//            });
//        },
//
//        show: function(options){
//        	this._super();
//            var self = this;
//            var product_tmpl_id = self.gui.get_current_screen_param('product_tmpl_id');
//            var template = this.pos.db.template_by_id[product_tmpl_id];
//            // Display Name of Template
//            this.$('#variant-title-name').html(template.name);
//
//            // Render Variants
//            var variant_ids  = this.pos.db.template_by_id[product_tmpl_id].product_variant_ids;
//            var variant_list = [];
//            for (var i = 0, len = variant_ids.length; i < len; i++) {
//                variant_list.push(this.pos.db.get_product_by_id(variant_ids[i]));
//            }
//            this.variant_list_widget.filters = {}
//            this.variant_list_widget.set_variant_list(variant_list);
//
//            // Render Attributes
//            var attribute_ids  = this.pos.db.attribute_by_template_id(template.id);
//            var attribute_list = [];
//            for (var i = 0, len = attribute_ids.length; i < len; i++) {
//                attribute_list.push(this.pos.db.get_product_attribute_by_id(attribute_ids[i]));
//            }
//            this.attribute_list_widget.set_attribute_list(attribute_list, template);
//            this._super();
//        },
//    });
//	gui.define_screen({name:'select_variant_screen', widget: SelectVariantScreen});
//
//	var VariantListWidget = PosBaseWidget.extend({
//        template:'VariantListWidget',
//
//        init: function(parent, options) {
//            var self = this;
//            this._super(parent, options);
//            this.variant_list = [];
//            this.filter_variant_list = [];
//            this.filters = {};
//            this.click_variant_handler = function(event){
//                var variant = self.pos.db.get_product_by_id(this.dataset['variantId']);
//                if(variant.to_weight && self.pos.config.iface_electronic_scale){
//                    self.__parentedParent.hide();
//                    self.pos_widget.screen_selector.set_current_screen('scale',{product: variant});
//                }else{
////                	ModifierWidget
////                	if(variant && variant.modifier_line.length > 0){
////                		var modifier_list = [];
////                		_.each(variant.modifier_line, function(modifier_id){
////                        	var modifier = self.pos.db.get_modifier_by_id(modifier_id);
////                        	if(modifier){
////                        		if(self.pos.db.get_product_by_id(modifier.product_id[0])){
////                        			modifier_list.push(modifier);
////                        		}
////                        	}
////                        });
////                		var modifier_html = QWeb.render("VariantModifierWidget",{widget: self, modifiers:modifier_list});
////    					var reseveline = document.createElement('tbody');
////    					reseveline.innerHTML = modifier_html;
////    					reseveline = reseveline.childNodes[1];
////    					$('.placeholder-ModifierWidget').html(reseveline);
////    	            } else {
////    	            	$('.placeholder-ModifierWidget').html("")
////    	            }
//                    self.pos.get_order().add_product(variant);
//                    self.gui.show_screen('products');
//                }
//            };
//        },
//
//        replace: function($target){
//            this.renderElement();
//            var target = $target[0];
//            target.parentNode.replaceChild(this.el,target);
//        },
//
//        set_filter: function(attribute_id, value_id){
//            this.filters[attribute_id] = value_id;
//            this.filter_variant();
//        },
//
//        reset_filter: function(attribute_id){
//            if (attribute_id in this.filters){
//                delete this.filters[attribute_id];
//            }
//            this.filter_variant();
//        },
//
//        filter_variant: function(){
//            var value_list = []
//            for (var item in this.filters){
//                value_list.push(parseInt(this.filters[item]));
//            }
//            this.filter_variant_list = [];
//            for (var index in this.variant_list){
//                var variant = this.variant_list[index];
//                var found = true;
//                for (var i = 0; i < value_list.length; i++){
//                    found = found && (variant.attribute_value_ids.indexOf(value_list[i]) != -1);
//                }
//                if (found){
//                    this.filter_variant_list.push(variant);
//                }
//            }
//            this.renderElement();
//        },
//
//        set_variant_list: function(variant_list){
//            this.variant_list = variant_list;
//            this.filter_variant_list = variant_list;
//            this.renderElement();
//        },
//
//        render_variant: function(variant){
//        	var order = this.pos.get_order();
//        	var image_url = this.get_product_image_url(variant);
//            var variant_html = QWeb.render('VariantWidget', {
//                    widget:  this,
//                    variant: variant,
//                    image_url: image_url,
//                    pricelist: order.pricelist,
//                });
//            var variant_node = document.createElement('div');
//            variant_node.innerHTML = variant_html;
//            variant_node = variant_node.childNodes[1];
//            return variant_node;
//        },
//
//        get_product_image_url: function(product){
//        	return window.location.origin + '/web/image?model=product.product&field=image_medium&id='+product.id;
//        },
//
//        renderElement: function() {
//            var self = this;
//            var el_html  = QWeb.render(this.template, {widget: this});
//            var el_node = document.createElement('div');
//            el_node.innerHTML = el_html;
//            el_node = el_node.childNodes[1];
//            if(this.el && this.el.parentNode){
//                this.el.parentNode.replaceChild(el_node,this.el);
//            }
//            this.el = el_node;
//            var list_container = el_node.querySelector('.variant-list');
//            for(var i = 0, len = this.filter_variant_list.length; i < len; i++){
//            	if(this.filter_variant_list[i]){
//            		var variant_node = this.render_variant(this.filter_variant_list[i]);
//                    variant_node.addEventListener('click',this.click_variant_handler);
//                    list_container.appendChild(variant_node);
//            	}
//            }
//        },
//    });
//
//	var AttributeListWidget = PosBaseWidget.extend({
//        template:'AttributeListWidget',
//
//        init: function(parent, options) {
//            var self = this;
//            this.attribute_list = [];
//            this.product_template = null;
//            this.click_set_attribute_handler = function(event){
//                /*TODO: Refactor this function with elegant DOM manipulation */
//            	var parent = this.parentElement.parentElement.parentElement;
//                parent.children[0].classList.remove('selected');
////            	if($(this).find('div.button').hasClass('selected')){
////            		remove selected item
//                    for (var i = 0 ; i < parent.children[1].children[0].children.length; i ++){
//                        var elem = parent.children[1].children[0].children[i];
//                        elem.children[0].classList.remove('selected');
//                    }
////                }else{
//                	// add selected item
//                	$(this).parent().find('div.button').removeClass('selected');
//                	this.children[0].classList.add('selected');
//                    self.__parentedParent.variant_list_widget.set_filter(this.dataset['attributeId'], this.dataset['attributeValueId']);
////                }
//            };
//            this.click_reset_attribute_handler = function(event){
//                /*TODO: Refactor this function with elegant DOM manipulation */
//                // remove selected item
//                var parent = this.parentElement;
//                if($(this).parent().find('.value-list-container').is(":visible")){
//                	parent.children[0].classList.remove('selected');
//                	for (var i = 0 ; i < parent.children[1].children[0].children.length; i ++){
//                        var elem = parent.children[1].children[0].children[i];
//                        elem.children[0].classList.remove('selected');
//                    }
//                	$(this).parent().find('.value-list-container').slideUp(300);
//                	$(this).find('i').removeClass('fa fa-minus');
//            		$(this).find('i').addClass('fa fa-plus');
//            		this.classList.add('selected');
//            		self.__parentedParent.variant_list_widget.reset_filter(this.dataset['attributeId']);
//                }else{
//                	// add selected item
//                    this.classList.add('selected');
//                    self.__parentedParent.variant_list_widget.reset_filter(this.dataset['attributeId']);
//                    $(this).parent().find('.value-list-container').slideDown(300);
//                    $(this).find('i').removeClass('fa fa-plus');
//            		$(this).find('i').addClass('fa fa-minus');
//                }
//            };
//            this._super(parent, options);
//        },
//
//        replace: function($target){
//            this.renderElement();
//            var target = $target[0];
//            target.parentNode.replaceChild(this.el,target);
//        },
//
//        set_attribute_list: function(attribute_list, product_template){
//            this.attribute_list = attribute_list;
//            this.product_template = product_template;
//            this.renderElement();
//        },
//
//        render_attribute: function(attribute){
//            var attribute_html = QWeb.render('AttributeWidget',{
//                    widget:  this,
//                    attribute: attribute,
//                });
//            var attribute_node = document.createElement('div');
//            attribute_node.innerHTML = attribute_html;
//            attribute_node = attribute_node.childNodes[1];
//            
//            var list_container = attribute_node.querySelector('.value-list');
//            for(var i = 0, len = attribute.value_ids.length; i < len; i++){
//                var value = this.pos.db.get_product_attribute_value_by_id(attribute.value_ids[i]);
//                var product_list = this.pos.db.get_product_by_ids(this.product_template.product_variant_ids);
//                var subproduct_list = this.pos.db.get_product_by_value_and_products(value.id, product_list);
//                var variant_qty = subproduct_list.length;
//                // Hide product attribute value if there is no product associated to it
//                if (variant_qty != 0) {
//                    var value_node = this.render_value(value, variant_qty);
//                    value_node.addEventListener('click', this.click_set_attribute_handler);
//                    list_container.appendChild(value_node);
//                }
//            };
//            return attribute_node;
//        },
//
//        render_value: function(value, variant_qty){
//            var value_html = QWeb.render('AttributeValueWidget',{
//                    widget:  this,
//                    value: value,
//                    variant_qty: variant_qty,
//                });
//            var value_node = document.createElement('div');
//            value_node.innerHTML = value_html;
//            value_node = value_node.childNodes[1];
//            return value_node;
//        },
//
//
//        renderElement: function() {
//            var self = this;
//            var el_html  = QWeb.render(this.template, {widget: this});
//            var el_node = document.createElement('div');
//            el_node.innerHTML = el_html;
//            el_node = el_node.childNodes[1];
//            if(this.el && this.el.parentNode){
//                this.el.parentNode.replaceChild(el_node,this.el);
//            }
//            this.el = el_node;
//
//            var list_container = el_node.querySelector('.attribute-list');
//            for(var i = 0, len = this.attribute_list.length; i < len; i++){
//                var attribute_node = this.render_attribute(this.attribute_list[i]);
//                attribute_node.querySelector('.attribute-name').addEventListener('click', this.click_reset_attribute_handler);
////                attribute_node.addEventListener('click', this.click_reset_attribute_handler);
//                list_container.appendChild(attribute_node);
//            };
//        },
//    });

    var SelectVariantScreen = screens.ScreenWidget.extend({
        template:'SelectVariantScreen',
        events: {
            'click .variant-virtual-cart-table .delete-variant': 'delete_variant_line',
            'click .button.proceed': 'click_proceed',
            'change input.variant-quantity':'change_variant_quantity',
            'click .o_modifier_delete':'modifier_delete',
            'click tr.variant-cart-line':'line_click',
        },
        init: function(parent, options){
            this._super(parent, options);
        },
        line_click: function(event){
            var self = this;
            var variant_id = Number($(event.currentTarget).attr('data-variant-id'));
            if(variant_id){
                self.remove_selected_lines();
                $(event.currentTarget).addClass('selected-variant-cart-line');
                if(self.variant_list_widget.variant_info.length > 0){
                    var variant_detail = _.find(self.variant_list_widget.variant_info, function(variant_data){
                        return variant_data.id === variant_id;
                    });
                    if(variant_detail){
                        variant_detail['is_selected'] = true;
                    }
                }
            }else{
                alert("Can't select line!");
            }
        },
        remove_selected_lines: function(){
            var self = this;
            if(self.variant_list_widget.variant_info.length > 0){
                self.variant_list_widget.variant_info.map(function(variant){
                    variant['is_selected'] = false;
                });
                $('.variant-cart-line').removeClass('selected-variant-cart-line');
            }
        },
        modifier_delete: function(event){
            var self = this;
            var variant_id = Number($(event.currentTarget).attr('data-variant-id'));
            var modifire_id = Number($(event.currentTarget).attr('data-modifier-id'));
            if(variant_id && modifire_id){
                if(self.variant_list_widget.variant_info.length > 0){
                    var variant_detail = _.find(self.variant_list_widget.variant_info, function(variant_data){
                        return variant_data.id === variant_id;
                    });
                    if(variant_detail.modifiers && variant_detail.modifiers.length > 0){
                        var modifier = _.find(variant_detail.modifiers, function(mod){
                            return mod.modifier_id === modifire_id;
                        });
                        variant_detail.modifiers = variant_detail.modifiers.filter(function(item) {
                            return item.modifier_id !== modifire_id;
                        });
                    }
                    self.variant_list_widget.variant_info.map(function(variant_info){
                        self.variant_list_widget.update_variant_cart(variant_info);
                    });
                }
            }else{
                alert("Can't delete modifier");
            }
        },
        change_variant_quantity: function(event){
            var self = this;
            var qty = Number($(event.currentTarget).val());
            if(qty || qty == 0){
                var variant_id = Number($(event.currentTarget).attr('data-variant-id'));
                if(variant_id){
                    if(self.variant_list_widget.variant_info.length > 0){
                        var variant_modifier = _.find(self.variant_list_widget.variant_info, function(item){
                            return item.id === variant_id;
                        });
                        if(variant_modifier){
                            variant_modifier.qty = qty;
                            if(variant_modifier.modifiers && variant_modifier.modifiers.length > 0){
                                variant_modifier.modifiers.map(function(modifier){
                                    modifier['modifier_qty'] = qty;
                                });
                            }
                        }
                    }
                }
            }
        },
        click_proceed: function(){
            var self = this;
            if(this.variant_list_widget.variant_info.length > 0){
                this.variant_list_widget.variant_info.map(function(variant){
                    var product = self.pos.db.get_product_by_id(variant.id);
                    if(product){
                        var order = self.pos.get_order();
                        var unit_price = self.pos.db.get_product_by_id(variant.id).get_price(order.pricelist,1);
                        var line = new models.Orderline({}, {pos: self.pos, order: order, product: product});
                        line.set_quantity(variant.qty);
                        line.set_unit_price(unit_price);

                        var product_quaty = self.pos.get_order().cart_product_qnty(product.id,true);
                        if(self.pos.config.restrict_order && self.pos.get_cashier().access_show_qty && product.type != "service"){
                            if(self.pos.config.prod_qty_limit){
                                var remain = product.qty_available-self.pos.config.prod_qty_limit
                                if(product_quaty >= remain){
                                    if(self.pos.config.custom_msg){
                                        self.pos.db.notification('warning',self.pos.config.custom_msg);
                                    } else{
                                        self.pos.db.notification('warning', _t('Product Out of Stock'));
                                    }
                                    return
                                }
                            }
                            else if(product_quaty >= product.qty_available && !self.pos.config.prod_qty_limit){
                                if(self.pos.config.custom_msg){
                                    self.pos.db.notification('warning',self.pos.config.custom_msg);
                                } else{
                                    self.pos.db.notification('warning', _t('Product Out of Stock'));
                                }
                                return
                            }else{
                                order.add_orderline(line);
                            }
                        }else{
                            order.add_orderline(line);
                        }
                        if(variant.modifiers && variant.modifiers.length > 0){
//        					var selected_line = self.pos.get_order().get_selected_orderline();
                            if(line){
                                var take_away = $('div#take_away').hasClass('selected-menu');
                                var drive_through_mode = $('div#drive_through_mode').hasClass('selected-menu');
                                var drive_in = $('div#dine_in_mode').hasClass('selected-menu');
                                var online = $('div#online_mode').hasClass('selected-menu');
                                variant.modifiers.map(function(modifier){
                                    line.set_modifier_line({
                                        id: modifier.modifier_id,
                                        price: Number(modifier.modifier_price),
                                        product_id: modifier.modifier_product_id[0],
                                        name:modifier.modifier_display_name,
                                        consider: true,
                                        drive_through: drive_through_mode || false,
                                        dine_in_mode: drive_in || false,
                                        online_mode: online || false,
                                        is_takeaway: take_away || false,
                                    }, modifier.modifier_qty || 1);
                                    self.pos.chrome.screens.products.order_widget.orderline_change(line);
                                });
                            }
                        }
                    }
                });
                self.pos.gui.show_screen('products');
            }else{
                alert("Please select atleast one product!");
            }
        },
        delete_variant_line: function(event){
            var self = this;
            var variant_id = Number($(event.currentTarget).attr('data-variant-id'));
            if(variant_id){
//      	this.variant_list_widget.variant_info.map(function(variant){
                this.variant_list_widget.variant_info = this.variant_list_widget.variant_info.filter(function(item) {
                    return item.id !== variant_id;
                });
                if(this.variant_list_widget.variant_info.length > 0){
                    this.variant_list_widget.variant_info.map(function(variant_info){
                        self.variant_list_widget.update_variant_cart(variant_info);
                    });
                }else{
                    self.variant_list_widget.update_variant_cart(false);
                }
            }
        },
        start: function(){
            this._super();
            var self = this;
            // Define Variant Widget
            this.variant_list_widget = new VariantListWidget(this,{});
            this.variant_list_widget.replace(this.$('.placeholder-VariantListWidget'));

            // Define Attribute Widget
            this.attribute_list_widget = new AttributeListWidget(this,{});
            this.attribute_list_widget.replace(this.$('.placeholder-AttributeListWidget'));

            // Add behaviour on Cancel Button
            this.$('#variant-popup-cancel').off('click').click(function(){
                self.gui.back();
            });
        },

        show: function(options){
            this._super();
            var self = this;
            self.$el.find('.modifiers-list-contents').html('');
            $(".modifier_base_variant").html('');
            self.variant_list_widget.variant_info = [];
            self.$el.find('.proceed').css({
                'background':'#000',
                'color':'#fff',
            });
            var product_tmpl_id = self.gui.get_current_screen_param('product_tmpl_id');
            var template = this.pos.db.template_by_id[product_tmpl_id];
            // Display Name of Template
            this.$('#variant-title-name').html(template.name);

            // Render Variants
            var variant_ids  = this.pos.db.template_by_id[product_tmpl_id].product_variant_ids;
            var variant_list = [];
            for (var i = 0, len = variant_ids.length; i < len; i++) {render
                variant_list.push(this.pos.db.get_product_by_id(variant_ids[i]));
            }
            this.variant_list_widget.filters = {}
            this.variant_list_widget.set_variant_list(variant_list);

            // Render Attributes
            var attribute_ids  = this.pos.db.attribute_by_template_id(template.id);
            var attribute_list = [];
            for (var i = 0, len = attribute_ids.length; i < len; i++) {
                attribute_list.push(this.pos.db.get_product_attribute_by_id(attribute_ids[i]));
            }
            this.attribute_list_widget.set_attribute_list(attribute_list, template);
            this._super();
        },
    });
    gui.define_screen({name:'select_variant_screen', widget: SelectVariantScreen});

    var VariantModifierWidget = screens.ScreenWidget.extend({
        template:'VariantModifierWidget',
        init : function(options,modifier_ids){
            var self = this;
            this._super(options);
            this.modifier_list = [];
            _.each(modifier_ids, function(modifier_id){
                var modifier = self.pos.db.get_modifier_by_id(modifier_id);
                if(modifier){
                    if(self.pos.db.get_product_by_id(modifier.product_id[0])){
                        self.modifier_list.push(modifier);
                    }
                }
            });
        },
        start:function(){
            var self = this;
            var madifier_html = QWeb.render('VariantModifierListWidget', {
                widget:  this,
                modifiers:self.modifier_list
            });
            $('.modifier_base_variant').html(madifier_html);
            $('.modifier_base_variant').find('.modifier_button').click(function(event){
                var modifier_id = Number($(event.currentTarget).data('modifier-id'));
                var variant_info = self.__parentedParent.variant_info;
                if(variant_info && variant_info.length > 0){
                    var variant_data = _.find(variant_info, function(variant){
                        return variant.is_selected == true;
                    });
                    var modifier = self.pos.db.get_modifier_by_id(modifier_id);
                    if(modifier && variant_data){
                        var modifier_data = {
                            'modifier_qty': modifier.qty,
                            'modifier_id': modifier.id,
                            'modifier_price': modifier.price,
                            'modifier_product_id': modifier.product_id,
                            'modifier_display_name': modifier.display_name,
                        }
                        if(!variant_data['modifiers']){
                            modifier_data['modifier_qty'] = variant_data.qty;
                            variant_data['modifiers'] = [modifier_data];
                        }else{
                            var exis_modifier = _.find(variant_data['modifiers'], function(mod){
                                return mod.id === modifier.id;
                            });
                            if(!exis_modifier){
                                variant_data['modifiers'].push(modifier_data);
                            }
                        }
                    }
                }
                variant_info.map(function(variant){
                    self.__parentedParent.__parentedParent.variant_list_widget.update_variant_cart(variant);
                })
            });
        },
        get_image_url: function(modifier){
            return window.location.origin + '/web/image?model=product.modifier&field=icon&id='+modifier.id;
        },
    });

    var VariantListWidget = PosBaseWidget.extend({
        template:'VariantListWidget',
//        events : _.extend({}, PosBaseWidget.prototype.events, {
//	    	'click .js_variant_qty' : 'update_return_product_qty',
//	    }),
//        update_return_product_qty:function(ev){
//        	alert("call;")
//        	ev.preventDefault();
//        	alert("call2;")
//            var $link = $(ev.currentTarget);
//            var $input = $link.parent().parent().find("input");
//            console.log("$input",$input);
//            var product_elem = $('.variant-quantity[data-variant-id="'+$link.attr("data-variant-id")+'"]')
//            console.log("product_elem",product_elem);
////            if(!product_elem.hasClass('select_item')){
////            	product_elem.addClass('select_item')
////            }
//            var min = parseFloat($input.data("min") || 0);
//            var max = parseFloat($input.data("max") || $input.val());
//            var total_qty = parseFloat($input.data("total-qty") || 0);
//            var quantity = ($link.has(".fa-minus").length ? -1 : 1) + parseFloat($input.val(),10);
//            $input.val(quantity > min ? quantity : min);
//            $input.change();
//            return false;
//        },
        init: function(parent, options) {
            var self = this;
            this._super(parent, options);
            this.variant_list = [];
            this.filter_variant_list = [];
            this.filters = {};
            this.variant_info = [];
//            this.update_product_qty = function(ev){
//	        	ev.preventDefault();
//	            var $link = $(ev.currentTarget);
//	            var $input = $link.parent().parent().find("input");
//	            var product_elem = $('.product_content[data-line-id="'+$input.attr("name")+'"]')
//	            if(!product_elem.hasClass('select_item')){
//	            	product_elem.addClass('select_item')
//	            }
//	            var min = parseFloat($input.data("min") || 0);
//	            var max = parseFloat($input.data("max") || $input.val());
//	            var total_qty = parseFloat($input.data("total-qty") || 0);
//	            var quantity = ($link.has(".fa-minus").length ? -1 : 1) + parseFloat($input.val(),10);
//	            $input.val(quantity > min ? (quantity < max ? quantity : max) : min);
//	            $input.change();
//	            return false;
//	        };
            this.click_variant_handler = function(event){
                var variant = self.pos.db.get_product_by_id(this.dataset['variantId']);
                if(variant.to_weight && self.pos.config.iface_electronic_scale){
                    self.__parentedParent.hide();
                    self.pos_widget.screen_selector.set_current_screen('scale',{product: variant});
                }else{
                    if(variant && variant.modifier_line.length > 0){
                        new VariantModifierWidget(self,variant.modifier_line).replace($(".variant-modifiers"));
                    } else{
                        new VariantModifierWidget([]).replace($(".variant-modifiers"));
                    }
                    if(variant){
                        if(self.variant_info && self.variant_info.length > 0){
                            self.variant_info.map(function(variant){
                                variant['is_selected'] = false;
                            });
                        }
                        variant['is_selected'] = true;
                        self.update_variant_cart(variant);
                    }
                }
            };
        },
        update_variant_cart: function(variant){
            var self = this;
            var order = self.pos.get_order();
            if(order && variant){
                var vals = {
                    'id':variant.id,
                    'display_name':variant.display_name,
                    'image':self.get_product_image_url(variant),
                    'modifiers':variant.modifiers || false,
                    'qty':1,
                    'is_selected':variant.is_selected || false,
                };
                if(!self.variant_info || self.variant_info.length <= 0){
                    self.variant_info = [vals];
                }else{
                    var exist_variant = _.find(self.variant_info, function(variant_rec){
                        return variant_rec.id === variant.id;
                    });
                    if(!exist_variant){
                        self.variant_info.push(vals);
                    }
                }
                if(self.variant_info && self.variant_info.length > 0){
                    var contents = $('.modifiers-list-contents')
                    var line_html = QWeb.render('VariantVirtualCartLines', {
                        widget: self,
                        variant_info: self.variant_info,
                    });
                    contents.html(line_html);
                }
            }else{
                $('.modifiers-list-contents').html('');
            }
            if(self.variant_info && self.variant_info.length > 0){
                $('.proceed').css({
                    'background':'#50b6a0 none repeat scroll 0% 0%',
                    'color':'#fff',
                });
            }else{
                $('.proceed').css({
                    'background':'#000',
                    'color':'#fff',
                });
            }
            $('a.js_variant_qty').click(function(ev){
                ev.preventDefault();
                var $link = $(ev.currentTarget);
                var $input = $link.parent().parent().find("input");
                var product_elem = $('.product_content[data-line-id="'+$input.attr("name")+'"]')
                if(!product_elem.hasClass('select_item')){
                    product_elem.addClass('select_item')
                }
                var min = parseFloat($input.data("min") || 1);
                var max = parseFloat($input.data("max") || $input.val());
                var total_qty = parseFloat($input.data("total-qty") || 0);
                var quantity = ($link.has(".fa-minus").length ? -1 : 1) + parseFloat($input.val(),10);
                $input.val(quantity > min ? quantity : min);
                $input.change();
            })
        },
        replace: function($target){
            this.renderElement();
            var target = $target[0];
            target.parentNode.replaceChild(this.el,target);
        },
        set_filter: function(attribute_id, value_id){
            this.filters[attribute_id] = value_id;
            this.filter_variant();
        },
        reset_filter: function(attribute_id){
            if (attribute_id in this.filters){
                delete this.filters[attribute_id];
            }
            this.filter_variant();
        },
        filter_variant: function(){
            var value_list = []
            for (var item in this.filters){
                value_list.push(parseInt(this.filters[item]));
            }
            this.filter_variant_list = [];
            for (var index in this.variant_list){
                var variant = this.variant_list[index];
                var found = true;
                for (var i = 0; i < value_list.length; i++){
                    found = found && (variant.attribute_value_ids.indexOf(value_list[i]) != -1);
                }
                if (found){
                    this.filter_variant_list.push(variant);
                }
            }
            this.renderElement();
        },
        set_variant_list: function(variant_list){
            this.variant_list = variant_list;
            this.filter_variant_list = variant_list;
            this.renderElement();
        },
        render_variant: function(variant){
            var order = this.pos.get_order();
            var image_url = this.get_product_image_url(variant);
            var variant_html = QWeb.render('VariantWidget', {
                    widget:  this,
                    variant: variant,
                    image_url: image_url,
                    pricelist: order.pricelist,
                });
            var variant_node = document.createElement('div');
            variant_node.innerHTML = variant_html;
            variant_node = variant_node.childNodes[1];
            return variant_node;
        },
        get_product_image_url: function(product){
            return window.location.origin + '/web/image?model=product.product&field=image_medium&id='+product.id;
        },
        renderElement: function() {
            var self = this;
            var el_html  = QWeb.render(this.template, {widget: this});
            var el_node = document.createElement('div');
            el_node.innerHTML = el_html;
            el_node = el_node.childNodes[1];
            if(this.el && this.el.parentNode){
                this.el.parentNode.replaceChild(el_node,this.el);
            }
            this.el = el_node;
            var list_container = el_node.querySelector('.variant-list');
            for(var i = 0, len = this.filter_variant_list.length; i < len; i++){
                if(this.filter_variant_list[i]){
                    var variant_node = this.render_variant(this.filter_variant_list[i]);
                    variant_node.addEventListener('click',this.click_variant_handler);
                    list_container.appendChild(variant_node);
                }
            }
        },
    });

    var AttributeListWidget = PosBaseWidget.extend({
        template:'AttributeListWidget',

        init: function(parent, options) {
            var self = this;
            this.attribute_list = [];
            this.product_template = null;
            this.click_set_attribute_handler = function(event){
                /*TODO: Refactor this function with elegant DOM manipulation */
                var parent = this.parentElement.parentElement.parentElement;
                parent.children[0].classList.remove('selected');
//            	if($(this).find('div.button').hasClass('selected')){
//            		remove selected item
                    for (var i = 0 ; i < parent.children[1].children[0].children.length; i ++){
                        var elem = parent.children[1].children[0].children[i];
                        elem.children[0].classList.remove('selected');
                    }
//                }else{
                    // add selected item
                    $(this).parent().find('div.button').removeClass('selected');
                    this.children[0].classList.add('selected');
                    self.__parentedParent.variant_list_widget.set_filter(this.dataset['attributeId'], this.dataset['attributeValueId']);
//                }
            };
            this.click_reset_attribute_handler = function(event){
                /*TODO: Refactor this function with elegant DOM manipulation */
                // remove selected item
                var parent = this.parentElement;
                if($(this).parent().find('.value-list-container').is(":visible")){
                    parent.children[0].classList.remove('selected');
                    for (var i = 0 ; i < parent.children[1].children[0].children.length; i ++){
                        var elem = parent.children[1].children[0].children[i];
                        elem.children[0].classList.remove('selected');
                    }
                    $(this).parent().find('.value-list-container').slideUp(300);
                    $(this).find('i').removeClass('fa fa-minus');
                    $(this).find('i').addClass('fa fa-plus');
                    this.classList.add('selected');
                    self.__parentedParent.variant_list_widget.reset_filter(this.dataset['attributeId']);
                }else{
                    // add selected item
                    this.classList.add('selected');
                    self.__parentedParent.variant_list_widget.reset_filter(this.dataset['attributeId']);
                    $(this).parent().find('.value-list-container').slideDown(300);
                    $(this).find('i').removeClass('fa fa-plus');
                    $(this).find('i').addClass('fa fa-minus');
                }
            };
            this._super(parent, options);
        },

        replace: function($target){
            this.renderElement();
            var target = $target[0];
            target.parentNode.replaceChild(this.el,target);
        },

        set_attribute_list: function(attribute_list, product_template){
            this.attribute_list = attribute_list;
            this.product_template = product_template;
            this.renderElement();
        },

        render_attribute: function(attribute){
            var attribute_html = QWeb.render('AttributeWidget',{
                    widget:  this,
                    attribute: attribute,
                });
            var attribute_node = document.createElement('div');
            attribute_node.innerHTML = attribute_html;
            attribute_node = attribute_node.childNodes[1];
            
            var list_container = attribute_node.querySelector('.value-list');
            for(var i = 0, len = attribute.value_ids.length; i < len; i++){
                var value = this.pos.db.get_product_attribute_value_by_id(attribute.value_ids[i]);
                var product_list = this.pos.db.get_product_by_ids(this.product_template.product_variant_ids);
                var subproduct_list = this.pos.db.get_product_by_value_and_products(value.id, product_list);
                var variant_qty = subproduct_list.length;
                // Hide product attribute value if there is no product associated to it
                if (variant_qty != 0) {
                    var value_node = this.render_value(value, variant_qty);
                    value_node.addEventListener('click', this.click_set_attribute_handler);
                    list_container.appendChild(value_node);
                }
            };
            return attribute_node;
        },

        render_value: function(value, variant_qty){
            var value_html = QWeb.render('AttributeValueWidget',{
                    widget:  this,
                    value: value,
                    variant_qty: variant_qty,
                });
            var value_node = document.createElement('div');
            value_node.innerHTML = value_html;
            value_node = value_node.childNodes[1];
            return value_node;
        },


        renderElement: function() {
            var self = this;
            var el_html  = QWeb.render(this.template, {widget: this});
            var el_node = document.createElement('div');
            el_node.innerHTML = el_html;
            el_node = el_node.childNodes[1];
            if(this.el && this.el.parentNode){
                this.el.parentNode.replaceChild(el_node,this.el);
            }
            this.el = el_node;

            var list_container = el_node.querySelector('.attribute-list');
            for(var i = 0, len = this.attribute_list.length; i < len; i++){
                var attribute_node = this.render_attribute(this.attribute_list[i]);
                attribute_node.querySelector('.attribute-name').addEventListener('click', this.click_reset_attribute_handler);
//                attribute_node.addEventListener('click', this.click_reset_attribute_handler);
                list_container.appendChild(attribute_node);
            };
        },
    });

    /* Add Table Reservation Screen */
    var AddTableReservationScreenWidget = screens.ScreenWidget.extend({
        template: 'AddTableReservationScreenWidget',
        init: function(parent, options){
            var self = this;
            this._super(parent, options);
            this.table_seat = 0;
        },
        events: {
            'click .button.back': 'click_back',
            'click .each_tbl':'click_table',
            'change #table_reservation_date': 'on_change_reservation_date',
            'change #table_reservation_time': 'on_change_reservation_time',
            'keyup #table_reservation_duration': 'on_keyup_reservation_duration',
            'keyup #enter_no_of_guest': 'on_keyup_no_of_guest',
        },
        on_keyup_no_of_guest: function(event){
            self.$el.find('.all_table_show').html('');
            var date = self.$el.find("#table_reservation_date").val();
            var time = self.$el.find("#table_reservation_time").val();
            var duration = self.$el.find("#table_reservation_duration").val();
            if(date && time && duration){
                self.$el.find('.check_table_availability_btn').addClass("active");
            }
        },
        on_keyup_reservation_duration: function(event){
            self = this;
            self.$el.find('.all_table_show').html('');
            var date = self.$el.find("#table_reservation_date").val();
            var time = self.$el.find("#table_reservation_time").val();
            var no_of_guest = self.$el.find("#enter_no_of_guest").val();
            if(date && time && no_of_guest){
                self.$el.find('.check_table_availability_btn').addClass("active");
            }
        },
        on_change_reservation_date: function(event){
            self = this;
            self.$el.find('.all_table_show').html('');
            var time = self.$el.find("#table_reservation_time").val();
            var duration = self.$el.find("#table_reservation_duration").val();
            var no_of_guest = self.$el.find("#enter_no_of_guest").val();
            if(time && duration && no_of_guest){
                self.$el.find('.check_table_availability_btn').addClass("active");
            }
        },
        on_change_reservation_time: function(event){
            self = this;
            self.$el.find('.all_table_show').html('');
            var date = self.$el.find("#table_reservation_date").val()
            var duration = self.$el.find("#table_reservation_duration").val();
            var no_of_guest = self.$el.find("#enter_no_of_guest").val();
            if(date && duration && no_of_guest){
                self.$el.find('.check_table_availability_btn').addClass("active");
            }
        },
        click_back: function(){
            this.pos.gui.back();
        },
        show: function(){
            var self = this;
            this._super();
            self.$el.find("#table_reservation_time").timepicker();
            self.$el.find("#table_reservation_duration").val(self.pos.config.table_reservation_duration);
            self.$el.find('#table_reservation_date').val('');
            self.$el.find('#table_reservation_time').val('');
            self.$el.find(".table_availability").click(function(event){
                event.stopImmediatePropagation();
                self.table_seat = 0;
                var no_of_guest = Number($('#enter_no_of_guest').val());
                var reservation_date = $('#table_reservation_date').val();
                var reservation_time = $('#table_reservation_time').val();
                var duration_time = $('#table_reservation_duration').val();
                if(duration_time <= 0){
                    $('#table_reservation_duration').focus();
                    return alert("Please enter valid duration")
                }
                self.$el.find('.check_table_availability_btn').removeClass("active");
                if(no_of_guest){
                    if(reservation_date){
                        if(reservation_time){
                            if(duration_time){
                                var arg = {
                                    'reserve_date_time':reservation_date + ' ' + reservation_time ,
                                    'no_of_guest':no_of_guest,
                                    'requested_duration':duration_time,
                                };
                                var params = {
                                    model: 'restaurant.table.reservation',
                                    method: 'reservation_validation',
                                    args: [arg],
                                }
                                rpc.query(params, {async: false})
                                .then(function(res){
                                    if(res && res[0]){
                                        self.render_tables(res)
                                    } else{
                                        self.render_tables([]);
                                    }
                                })
                            } else{
                                alert("Please enter duration for hold the table!");
                            }
                        }else{
                            alert("Please select reservation time");
                        }
                    }else{
                        alert("Please select reservation date");
                    }
                }else{
                    alert("Please select number of guest!");
                }
            });
        },
        render_tables: function(tbl_ids){
            var self = this;
            var all_table_ids = []
            var booked = [];
            var tables = self.pos.table.floor.tables
            self.$el.find('.all_table_show').html('');
            if(tbl_ids.length > 0){
                var filter_ids = [];
                _.each(tables,function(table){
                    all_table_ids.push(table.id)
                });
                all_table_ids = all_table_ids.filter(function(obj) { return tbl_ids.indexOf(obj) == -1; });
            } else{
                _.each(tables,function(table){
                    if(self.pos.table.floor_id[0] == table.floor_id[0]){
                        all_table_ids.push(table.id)
                    }
                });
            }
            _.each(tbl_ids,function(tbl){
                var table = self.pos.tables_by_id[tbl]
                if(self.pos.table.floor_id[0] == table.floor_id[0]){
                    booked.push(tbl);
                }
            })
            var param = {
                widget: self,
                restrict_table_ids: all_table_ids,
                booked_table_ids : booked,
            }
            self.$el.find('.all_table_show').html(QWeb.render('AvailableTableTemplate',param));
        },
        close: function(){
            this._super();
            this.$el.find('.all_table_show').html('');
        },
        click_table: function(event){
            var self = this;
            if($(event.currentTarget).hasClass('booked')){
                return;
            }
            var table_id = $(event.currentTarget).data('table-id');
            if(table_id){
                var table = self.pos.tables_by_id[table_id];
                var no_of_guest = Number($('#enter_no_of_guest').val());
                var reservation_date = $('#table_reservation_date').val();
                var reservation_time = $('#table_reservation_time').val();
                var reservation_duration = $('#table_reservation_duration').val();
                if(no_of_guest){
                    var tables = [];
                    if($(event.currentTarget).hasClass('table_selected')){
                        $(event.currentTarget).removeClass('table_selected');
                        self.table_seat -= table.seats
                    } else{
                        $(event.currentTarget).addClass('table_selected');
                        self.table_seat += table.seats
                    }
                    if(no_of_guest <= self.table_seat){
                        if(reservation_date){
                            if(reservation_time){
                                _.each($(".each_tbl"), function(el){
                                    if($(el).hasClass('table_selected')){
                                        var tbl_id = $(el).data('table-id');
                                        tables.push(self.pos.tables_by_id[tbl_id]);
                                    }
                                });
                                self.pos.gui.show_popup('reserve_table_popup',{
                                    'table':tables,
                                    'no_of_guest':no_of_guest,
                                    'reservation_date':reservation_date,
                                    'reservation_time':reservation_time,
                                    'reservation_duration':reservation_duration,
                                });
                            }else{
                                alert("Please select reservation time!");
                            }
                        }else{
                            alert("Please select reservation date");
                        }
                    } else{
                        return;
                    }
                } else{
                    alert("Please select number of guest!");
                }
            }else{
                alert("Table id not found!");
            }
        },
    });
    gui.define_screen({name:'add_table_reservation_screen', widget: AddTableReservationScreenWidget});

    /* Table Reservation List Screen */
    var TableReservationScreenWidget = screens.ScreenWidget.extend({
        template: 'TableReservationScreenWidget',
        init: function(parent, options){
            this._super(parent, options);
            this.reserved_table_order_data = false;
        },
        events: {
            'click .button.back': 'click_back',
            'click .button.add_reservation': 'click_add_reservation',
            'keyup .searchbox input': 'search_table_reservation',
            'click .searchbox .search-clear': 'clear_search',
            'click #start_order' : 'start_reserved_table_order',
            'click #allocate_table' : 'allocate_table',
        },
        allocate_table: function(e){
            var self = this;
            var record_id = $(e.currentTarget).data('id');
            var selectedOrder = self.pos.get_order();
            if(record_id){
                var reservation_data = {
                    model: 'restaurant.table.reservation',
                    method: 'write',
                    args: [Number(record_id), {'state':'confirm'}]
                }
                rpc.query(reservation_data, {async: false})
                .then(function(result){
                    if(result){
                        var records = self.pos.db.get_reserved_table_orders();
                        var match = _.findWhere(records, {id:record_id});
                        match.state = 'confirm';
                        self.render_list(records);
                        self.pos.db.notification('success',"Table(s) has been allocated!");
                    }
                });
                var reserved_rec = self.pos.db.get_reserved_table_order_by_id(record_id);
                if(reserved_rec.table_ids && reserved_rec.table_ids[0]){
                    selectedOrder.set_merge_table_ids(reserved_rec.table_ids);
                }
                var client = self.pos.db.get_partner_by_id(reserved_rec.partner_id[0]);
                selectedOrder.set_client(client);
                selectedOrder.set_rest_table_reservation_id(Number(record_id));
                selectedOrder.initialize_validation_date();
                this.pos.push_order(selectedOrder);
                self.pos.get_order().set_merge_table_ids([]);
                self.pos.set_table(self.pos.table);
//				self.gui.show_screen('products');
            }
        },
        start_reserved_table_order: function(e){
            var self = this;
            var record_id = $(e.currentTarget).data('id');
            var order = self.pos.get_order();
            if(record_id){
                var reserved_rec = self.pos.db.get_reserved_table_order_by_id(record_id);
                if(reserved_rec.table_ids.length == 1){
                    var table = self.pos.tables_by_id[reserved_rec.table_ids[0]];
                    self.pos.set_table(table)
                } else{
                    var merge_table_ids = reserved_rec.table_ids;
                    /*Unlink existing table*/
                    var floor = self.pos.floors_by_id[self.pos.table.floor_id[0]];
                    if (floor && floor.tables && floor.tables[0]) {
                        floor.tables.map(function(table) {
                            if (table.parent_linked_table == self.pos.table) {
                                table.parent_linked_table = undefined;
                            }
                        });
                    }
                    if(merge_table_ids && merge_table_ids[0]){
                        order.set_merge_table_ids(merge_table_ids);
                    }
                    var table = self.pos.tables_by_id[merge_table_ids[0]];
                    if(order.get_merge_table_ids() && order.get_merge_table_ids()[0]){
                        var merged_tables = [];
                        merge_table_ids.map(function(id){
                            if(table.id != id){
                                var table_name = self.pos.tables_by_id[id];
                                if(table_name && table_name.name){
                                    merged_tables.push(table_name);
                                    table_name.parent_linked_table = table;
                                    table.is_parent = true;
                                }
                            }
                        });
                        self.pos.set_table(table);
                        if(merge_table_ids && merge_table_ids[0]){
                            self.pos.get_order().set_merge_table_ids(merge_table_ids);
                        }
                        $('span.orders.touch-scrollable .floor-button').replaceWith(QWeb.render('BackToFloorButton',{table: self.pos.table, floor:self.pos.table.floor,merged_tables:merged_tables}));
                        $('span.orders.touch-scrollable .floor-button').click(function(){
                            self.pos.chrome.widget.order_selector.floor_button_click_handler();
                        });
                    }
                }
                var reservation_data = {
                    model: 'restaurant.table.reservation',
                    method: 'write',
                    args: [Number(record_id), {'state':'confirm'}]
                }
                rpc.query(reservation_data, {async: false}).then(function(result){
                    if(result){
                        var records = self.pos.db.get_reserved_table_orders();
                        var match = _.findWhere(records, {id:record_id});
                        match.state = 'confirm';
                        self.render_list(records);
                        var value = {};
                        value[Number(record_id)] = 'done'
                        self.pos.get_order().set_reservation_order_state(value)
                    }
                });
            }
        },
        click_back: function(){
            this.gui.show_screen('products');
        },
        click_add_reservation: function(event){
            var self = this;
            self.gui.show_screen('add_table_reservation_screen');
        },
        clear_cart: function(){
            var self = this;
            var order = self.pos.get_order();
            var currentOrderLines = order.get_orderlines();
            var lines_ids = []
            if(!order.is_empty()) {
                _.each(currentOrderLines,function(item) {
                    lines_ids.push(item.id);
                });
                _.each(lines_ids,function(id) {
                    order.remove_orderline(order.get_orderline(id));
                });
            }
        },
        show: function(){
            var self = this;
            this._super();
            this.load_table_reservation();
            var today = new Date();
            var end_date = moment(today).locale('en').format('YYYY-MM-DD');
            document.getElementById("table_reservation_date").min = end_date;
        },
        load_table_reservation: function(){
            var self = this;
            var today = new Date();
            var end_date = moment(today).locale('en').format('YYYY-MM-DD');
            var params = {
                model: 'restaurant.table.reservation',
                method: 'search_read',
                domain: [['tbl_reserve_datetime', '>=', end_date + " 00:00:00"]],
            }
            rpc.query(params, {async: false}).then(function(records){
                var records = _.sortBy(records, 'tbl_reserve_datetime');
                self.reserved_table_order_data = records
                self.pos.db.add_reserved_table_orders(records);
                self.render_list(records);
            });
        },
        render_list: function(records){
            var self = this;
            if(records && records.length > 0){
                var contents = this.$el[0].querySelector('.reserved-table-order-list');
                contents.innerHTML = "";
                for(var i = 0, len = Math.min(records.length,1000); i < len; i++){
                    var self = this;
                    var record = records[i];
                    var table_name_string = "";
                    if(record.table_ids && record.table_ids[0]){
                        _.each(record.table_ids, function(table_id){
                            var table = self.pos.tables_by_id[table_id]
                            table_name_string += table.name + ',' + ' '
                        })
                        table_name_string = table_name_string.replace(/,\s*$/, "");
                    }
                    record['tables_string'] = table_name_string
                    var reseveline_html = QWeb.render('ReserveTablelistLine',{widget: this, record:record});
                    var reseveline = document.createElement('tbody');
                    reseveline.innerHTML = reseveline_html;
                    reseveline = reseveline.childNodes[1];
                    contents.appendChild(reseveline);
                }
            } else{
                var contents = this.$el[0].querySelector('.reserved-table-order-list');
                contents.innerHTML = "Record Not Found";
            }
        },
        perform_search_table_reservation: function(query, associate_result){
            var self = this;
            if(query){
                var records = this.pos.db.search_reserve_table(query);
                if ( associate_result && records.length === 1){
                    this.gui.back();
                }
                this.render_list(records);
            }else{
                this.render_list(self.reserved_table_order_data);
            }
        },
        clear_search: function(){
            var orders = this.reserved_table_order_data;
            this.render_list(orders);
            this.$('.searchbox input')[0].value = '';
            this.$('.searchbox input').focus();
        },
        search_table_reservation: function(e){
            var self = this;
            var search_timeout = null;
            clearTimeout(search_timeout);
            var query = $(e.currentTarget).val();
            search_timeout = setTimeout(function(){
                self.perform_search_table_reservation(query,e.which === 13);
            },70);
        },
    });
    gui.define_screen({name:'table_reservation_screen', widget: TableReservationScreenWidget});

});