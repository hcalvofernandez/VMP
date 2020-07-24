odoo.define('flexibite_com_advance.chrome', function (require) {
"use strict";

	var chrome = require('point_of_sale.chrome');
	var gui = require('point_of_sale.gui');
	var PosBaseWidget = require('point_of_sale.BaseWidget');
	var core = require('web.core');
	var rpc = require('web.rpc');
	var ActionManager = require('web.ActionManager');
	var models = require('point_of_sale.models');
	var session = require('web.session');
	var bus_service = require('bus.BusService');
	var cross_tab = require('bus.CrossTab').prototype;

	var _t = core._t;
	var QWeb = core.qweb;

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
    	    	rpc.query(params, {async: false}).then(function(result){}).fail(function(){
                	self.pos.db.notification('danger',"Connection lost");
                });
            	var current_screen = self.pos.gui.get_current_screen();
            	var user = self.pos.get_cashier();
                self.pos.set_locked_user(user.login);
                if(current_screen){
                	self.pos.set_locked_screen(current_screen);
                }
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

	chrome.Chrome.include({
		events: {
            "click #product_sync": "product_sync",
            "click #pos_lock": "pos_lock",
			"click #messages_button": "messages_button",
			"click #close_draggable_panal": "close_draggable_panal",
			"click #delete_msg_history": "delete_msg_history",
			"click #customer_display": "customer_display",
			"click #sale_note_chrome": "sale_note_chrome", //sale note events
            "click #close_sale_note_draggable_panal" :"close_sale_note_draggable_panal", //sale note events
//            'click #quick_delete_draft_order' : "quick_delete_draft_order", //sale note events
            'click #pay_quick_order' : "pay_quick_draft_order", //sale note events
            "click #delivery_list_chrome": "delivery_list_chrome",
            "click #close_draggable_panal_delivery_order" :"close_draggable_panal_delivery_order",
        },
        close_draggable_panal_delivery_order(){
        	$('#draggablePanelList_delivery_order').animate({
	            height: 'toggle'
	            }, 200, function() {
	        });
        },
        delivery_list_chrome: function(){
        	var self = this;
			if($('#draggablePanelList_delivery_order').css('display') == 'none'){
				$('#draggablePanelList_delivery_order').animate({
    	            height: 'toggle'
    	            }, 200, function() {
    	        });
				var delivery_orders = _.filter(self.pos.get('pos_order_list'), function(item) {
				     return item.delivery_type == 'pending'
				});

				self.render_delivery_order_list(delivery_orders);
				$('#draggablePanelList_delivery_order.draft_order .head_data_sale_note').html(_t("Delivery Orders"));
			} else{
				$('#draggablePanelList_delivery_order').animate({
    	            height: 'toggle'
    	            }, 200, function() {
    	        });
			}
        },
        render_delivery_order_list: function(orders){
        	var self = this;
        	if(orders){
        		var contents = $('.message-panel-body2');
	            contents.html("");
	            var order_count = 0;
	            for(var i = 0, len = Math.min(orders.length,1000); i < len; i++){
	                var order = orders[i];
                	order_count ++;
	                var orderlines = [];
	                order.amount_total = parseFloat(order.amount_total).toFixed(2);
	            	var clientline_html = QWeb.render('DeliveryOrdersQuickWidgetLine',{widget: this, order:order, orderlines:orderlines});
	                var clientline = document.createElement('tbody');
	                clientline.innerHTML = clientline_html;
	                clientline = clientline.childNodes[1];
	                contents.append(clientline);
	            }
	            self.pos.delivery_order_count = order_count;
	            self.$el.find('.delivery_order_count').text(order_count);
        	}
        },
        customer_display: function(){
        	var self = this;
        	window.open(self.pos.attributes.origin+'/web/customer_display' , '_blank');
        },
        product_sync: function(){
        	var self = this;
        	self.pos.load_new_products();
        	var products = self.pos.db.get_product_by_category(0);
	        self.pos.chrome.screens.products.product_list_widget.set_product_list(products);
        	$('.prodcut_sync').toggleClass('rotate', 'rotate-reset');
		},
		build_widgets: function(){
			var self = this;
			this._super();
			if(self.pos.user.user_role === 'cook'){
				self.gui.set_startup_screen('kitchen_screen');
				self.gui.show_screen('kitchen_screen');
			}else{
				self.slider_widget = new SliderWidget(this);
				self.pos_cart_widget = new PosCartCountWidget(this);
	        	self.slider_widget.replace(this.$('.placeholder-SliderWidget'));
	        	self.pos_cart_widget.replace(this.$('.placeholder-PosCartCountWidget'));
	        	if(!self.pos.is_rfid_login){
	        		$('.page-container').css({
	        			'width':'100%',
	        		});
	        	}

				if(self.pos.user.login_with_pos_screen) {
					var username = self.pos.user.login;
					var pin = self.pos.user.pos_security_pin;
					self.login_user(username,pin);
            	}else{
					self.gui.set_startup_screen('login');
					self.gui.show_screen('login');
				}
			}
			self.call('bus_service', 'updateOption','lock.data',session.uid);
			self.call('bus_service', 'updateOption','pos.order.line',session.uid);
			self.call('bus_service', 'updateOption','sale.note',session.uid);
			self.call('bus_service', 'onNotification', self, self._onNotification);
		    cross_tab._isRegistered = true;
		    cross_tab._isMasterTab = true;
			self.call('bus_service', 'startPolling');
		   	var products = self.pos.db.get_product_by_category(0); 
	        self.pos.chrome.screens.products.product_list_widget.set_product_list(products);
	        self.pos.chrome.call('bus_service', '_poll');
//	        if(!self.pos.load_background){
//	        	self.$el.find('#product_sync').trigger('click');
//	        }
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
		_onNotification: function(notifications){
			var self = this;
			var order = self.pos.get_order();
			for (var notif of notifications) {
				if(notif[1] && notif[1].terminal_lock){
					if(notif[1].terminal_lock[0]){
						if(self.pos.pos_session && (notif[1].terminal_lock[0].session_id[0] == self.pos.pos_session.id)){
							self.pos.set_lock_status(notif[1].terminal_lock[0].lock_status);
							self.pos.set_lock_data(notif[1].terminal_lock[0]);
						}
					}
	    		} else if(notif[1] && notif[1].terminal_message){
	    			if(notif[1].terminal_message[0]){
            			if(self.pos.pos_session.id == notif[1].terminal_message[0].message_session_id[0]){
            				var message_index = _.findIndex(self.pos.message_list, function (message) {
            					return message.id === notif[1].terminal_message[0].id;
                            });
                			if(message_index == -1){
                				self.pos.message_list.push(notif[1].terminal_message[0]);
                				self.render_message_list(self.message_list);
                				$('#message_icon').css("color", "#5EB937");
                				self.pos.db.notification('info',notif[1].terminal_message[0].sender_user[1]+' has sent new message.');
                			}
            			}
            		}
	    		}else if(notif[1] && notif[1].screen_display_data){
		    	    if(notif[1].screen_display_data.new_order){
		    	        self.gui.play_sound('bell');
		    	    }
	                var screen_data = [];
	                _.each(notif[1].screen_display_data.orders,function(order){
	                    _.each(order.order_lines,function(line){
	                        if(line.state != 'done' && line.state != 'cancel'){
	                            screen_data.push(line);
	                        }
	                    });
	                });
	                this.pos.set('screen_data',screen_data);
	                var screen_order_lines = [];
	                var categ_id = 0
	                if(self.chrome && self.chrome.screens && self.chrome.screens.kitchen_screen){
	                	categ_id = self.chrome.screens.kitchen_screen.categ_id;
	                }
	                _.each(notif[1].screen_display_data.orders,function(order){
	                    _.each(order.order_lines,function(line){
	                        if(categ_id == 0 && line.state != 'done' && line.state != 'cancel'){
	                            screen_order_lines.push(line);
	                        }else if(line.categ_id == categ_id && line.state != 'done' && line.state != 'cancel'){
	                             screen_order_lines.push(line);
	                        }
	                    });
	                });
	                if(self.chrome && self.chrome.screens && self.chrome.screens.kitchen_screen){
	                	self.chrome.screens.kitchen_screen.render_screen_order_lines(screen_order_lines);
	                	self.chrome.screens.kitchen_screen.render_table_data(notif[1].screen_display_data.orders);
	                }
	            }else if(notif[1] && notif[1].order_line_state){
	            	if(notif[1].order_line_state.order_id && notif[1].order_line_state.kitchen_status == 'done'){
	            		var updated_pos_order = _.find(self.pos.db.pos_orders, function(p_order){ return p_order.id ==  notif[1].order_line_state.order_id});
	            		if(updated_pos_order){
	            			updated_pos_order['kitchen_status'] = 'done';
							self.render_sale_note_order_list(self.pos.db.pos_orders || []);
	            		}
	            	}
	                if(self.pos.get_order_list().length !== 0){
	                    var collection_orders = self.pos.get_order_list()[0].collection.models;
	                    for (var i = 0; i < collection_orders.length; i++) {
	                        var collection_order_lines = collection_orders[i].orderlines.models;
	                        _.each(collection_order_lines,function(line){
	                            if(line.cid === notif[1].order_line_state.pos_cid && line.order.name ===  notif[1].order_line_state.pos_reference){
	                               line.state = notif[1].order_line_state.state;
	                               line.set_lock_orderline(true);
	                               self.gui.screen_instances.products.order_widget.renderElement();
	                            }
	                        });
	                    }
	                }
	                if(self.pos && self.pos.get_order()){
	                	self.pos.get_order().mirror_image_data();
	                }
	            }else if(notif[1] && notif[1].rating){
                    if(order){
                        order.set_rating(notif[1].rating);
                    }
                }else if(notif[1] && notif[1].partner_id){
                    var partner_id = notif[1].partner_id;
                    var partner = self.pos.db.get_partner_by_id(partner_id);
                    if(partner){
                        if(order){
                            order.set_client(partner);
                        }
                    }else{
                        if(partner_id){
                            var fields = _.find(self.pos.models,function(model){ return model.model === 'res.partner'; }).fields;
                            var params = {
                                model: 'res.partner',
                                method: 'search_read',
                                fields: fields,
                                domain: [['id','=',partner_id]],
                            }
                            rpc.query(params, {async: false})
                            .then(function(partner){
                                if(partner && partner.length > 0 && self.pos.db.add_partners(partner)){
                                    order.set_client(partner[0]);
                                }else{
                                    console.info("partner not loaded in pos.");
                                }
                            });
                        }else{
                            console.info("Partner id not found!")
                        }
                    }
                }else if (notif[1] && notif[1].cancelled_sale_note){
	    			var previous_sale_note = self.pos.db.pos_orders || [];
	    			self.pos.db.notification('danger',_t(notif[1].cancelled_sale_note[0].display_name + ' order has been deleted'));
	                previous_sale_note = previous_sale_note.filter(function(obj){
	                    return obj.id !== notif[1].cancelled_sale_note[0].id;
	                });
	                self.pos.db.add_orders(previous_sale_note);
	                if(self.chrome.screens.sale_note_list){
	                	self.chrome.screens.sale_note_list.render_list(previous_sale_note);
	                }
	                self.chrome.render_sale_note_order_list(previous_sale_note);
	    		} else if(notif[1] && notif[1].new_pos_order){
	                  var previous_sale_note = self.pos.db.pos_orders || [];
	                  if(notif[1].new_pos_order[0].state == "paid"){
	                  		self.pos.db.notification('success',_t(notif[1].new_pos_order[0].display_name + ' order has been paid.'));
		    			} else{
		    				self.pos.db.notification('success',_t(notif[1].new_pos_order[0].display_name + ' order has been created.'));
		    			}
	                  previous_sale_note.push(notif[1].new_pos_order[0]);
	                  var obj = {};
	                  for ( var i=0, len=previous_sale_note.length; i < len; i++ ){
	                      obj[previous_sale_note[i]['id']] = previous_sale_note[i];
	                  }
	                  previous_sale_note = new Array();
	                  for ( var key in obj ){
	                       previous_sale_note.push(obj[key]);
	                  }
	                  previous_sale_note.sort(function(a, b) {
	                      return b.id - a.id;
	                  });
	                  self.pos.db.add_orders(previous_sale_note)
	                  if(self && self.chrome && self.chrome.screens && self.chrome.screens.sale_note_list){
	                  	self.chrome.screens.sale_note_list.render_list(previous_sale_note);
	                  }
	              	self.chrome.render_sale_note_order_list(previous_sale_note);
	    		}else if(notif[1] && notif[1].destroy_pos_order){
	    			var order = self.pos.get_order();
	    			var collection_orders = self.pos.get_order_list()[0]? self.pos.get_order_list()[0].collection.models : [];
	    			if(collection_orders && collection_orders.length > 0){
	    				collection_orders.map(function(collection_order){
	    					if(collection_order.name == _t(notif[1].destroy_pos_order)){
	    						self.pos.db.notification('info','Order paid successfully by cashier!');
	    						collection_order.destroy();
	    					}
	    				});
	    			}
	    		} else if(notif[1] && notif[1].delivery_pos_order){
                	var existing_orders = self.pos.get('pos_order_list');
                	var filtered = _.filter(existing_orders, function(item) {
                	    return item.id !== notif[1].delivery_pos_order[0].id
                	});
                	filtered.push(notif[1].delivery_pos_order[0]);
                	filtered = _.sortBy(filtered, 'id').reverse();
                	self.pos.db.add_orders(filtered);
					self.pos.set({'pos_order_list':filtered});
					var delivery_orders = _.filter(self.pos.get('pos_order_list'), function(item) {
					     return item.delivery_type == 'pending'
					});
					self.render_delivery_order_list(delivery_orders);
                }
	    	}
		},
		pay_quick_draft_order: function(event){
			var self = this;
        	var order_id = parseInt($(event.currentTarget).data('id'));
            var result = self.pos.db.get_order_by_id(order_id);
            if(_.contains(['floors','receipt','bill'],self.pos.gui.get_current_screen())){
            	self.close_sale_note_draggable_panal();
            	return self.pos.gui.show_popup('flexi_alert',{
    			    'title':_t('Warning'),
    			    'body':_t("You can't set order in current screen."),
    			});
            }
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
//	           			if(result.rest_table_reservation_id.length > 0){
//	           	 			var table = self.pos.tables_by_id[result.table_ids[0]];
//	           	 			if(table){
//	           	 				self.pos.set_table(table);
//	           	 			}
//	           	 		}
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
	            	}
//	            }
	            selectedOrder.name = result.pos_reference;
	            if(selectedOrder.get_merge_table_ids() && selectedOrder.get_merge_table_ids().length > 0){
	            	var table = self.pos.tables_by_id[selectedOrder.get_merge_table_ids()[0]];
		            self.pos.table = table;
	            }
	           	self.chrome.screens.products.order_widget.renderElement();
	           	self.close_sale_note_draggable_panal();
	           	self.gui.show_screen('products');
//            }
		},
//		quick_delete_draft_order: function(event){
//			var self = this;
//        	var selectedOrder = this.pos.get_order();
//        	var order_id = parseInt($(event.currentTarget).data('id'));
//        	var selectedOrder = this.pos.get_order();
//        	var result = self.pos.db.get_sale_note_by_id(order_id);
//        	if (result && result.lines.length > 0) {
//        		var params = {
//    	    		model: 'pos.order',
//    	    		method: 'unlink',
//    	    		args: [result.id],
//    	    	}
//        		rpc.query(params, {async: false}).then(function(result){});
//        	}
//        	var sale_note_to_be_remove = self.pos.db.get_sale_note_by_id(result.id)
//        	var sale_note_list = self.pos.db.pos_orders;
//        	sale_note_list = _.without(sale_note_list, _.findWhere(sale_note_list, { id: sale_note_to_be_remove.id }));
//        	self.screens.sale_note_list.render_list(sale_note_list)
//        	self.render_sale_note_order_list(sale_note_list);
//        	self.pos.db.add_orders(sale_note_list)
//		},
		sale_note_chrome: function(){
			var self = this;
			$('#draggablePanelList').hide();
			if($('#saleNotedraggablePanelList').css('display') == 'none'){
				$('#saleNotedraggablePanelList').animate({
    	            height: 'toggle'
    	            }, 200, function() {
    	        });
				self.pos.chrome.screens.orderlist.reloading_orders().done(function(){
					self.render_sale_note_order_list(self.pos.db.pos_orders || []);
					$('.head_data').html(_t("Orders"));
					$('.panel-body').html("Order-Box Empty");
				});
			}else{
				$('#saleNotedraggablePanelList').animate({
    	            height: 'toggle'
    	            }, 200, function() {
    	        });
			}
		},
		render_sale_note_order_list: function(orders){
        	var self = this;
        	if(orders){
        		var contents = $('.message-panel-body');
	            contents.html("");
	            var order_count_el = $('#draft_order_count');
	            contents.html("");
	            var temp = [];
	            var order_count = 0;
	            for(var i = 0, len = Math.min(orders.length,1000); i < len; i++){
	                var order    = orders[i];
	                if(order.state == "draft"){
	                	order_count ++;
		                var orderlines = [];
		                order.amount_total = parseFloat(order.amount_total).toFixed(2);
		            	var clientline_html = QWeb.render('SaleNoteQuickWidgetLine',{widget: this, order:order, orderlines:orderlines});
		                var clientline = document.createElement('tbody');
		                clientline.innerHTML = clientline_html;
		                clientline = clientline.childNodes[1];
		                contents.append(clientline);
	                }
	            }
	            self.pos.order_quick_draft_count = order_count
            	$('.notification-count').show();
            	$('.draft_order_count').text(order_count);
        	}
        },
        close_sale_note_draggable_panal:function(){
			$('#saleNotedraggablePanelList').animate({
	            height: 'toggle'
	            }, 200, function() {
	        });
		},
		pos_lock: function(){
			var self = this;
			self.pos.session_by_id = {};
			var domain = [['state','=', 'opened'],['id','!=',self.pos.pos_session.id]];
         	var params = {
	    		model: 'pos.session',
	    		method: 'search_read',
	    		domain: domain,
	    	}
	    	rpc.query(params, {async: false}).then(function(sessions){
	    		if(sessions && sessions.length > 0){
	    			_.each(sessions,function(session){
	    				self.pos.session_by_id[session.id] = session;
	    			});
	    			self.pos.gui.show_popup('terminal_list',{'sessions':sessions});
	    		} else{
	    			self.pos.db.notification('danger',_t('Active sessions not found!'));
	    		}
	    	}).fail(function(){
            	self.pos.db.notification('danger',"Connection lost");
            });
		},
		messages_button: function(){
			var self = this;
			$('#saleNotedraggablePanelList').hide();
			if($('#draggablePanelList').css('display') == 'none'){
				$('#draggablePanelList').animate({
    	            height: 'toggle'
    	            }, 200, function() {
    	        });
				self.render_message_list(self.pos.message_list);
				$('.panel-body').css({'height':'auto','max-height':'242px','min-height':'45px','overflow':'auto'});
				$('.head_data').html(_t("Message"));
				$('.panel-body').html("Message-Box Empty");
			}else{
				$('#draggablePanelList').animate({
    	            height: 'toggle'
    	            }, 200, function() {
    	        });
			}
		},
		close_draggable_panal:function(){
			$('#draggablePanelList').animate({
	            height: 'toggle'
	            }, 200, function() {
	        });
		},
		delete_msg_history: function(){
			var self = this;
			var params = {
	    		model: 'message.terminal',
	    		method: 'delete_user_message',
	    		args: [self.pos.pos_session.id],
	    	}
	    	rpc.query(params, {async: false}).then(function(result){
	    		if(result){
	    			self.pos.message_list = []
		    		self.render_message_list(self.pos.message_list)
	    		}
	    	}).fail(function(){
            	self.pos.db.notification('danger',"Connection lost");
            });
		},
		render_message_list: function(message_list){
	    	var self = this;
	        if(message_list && message_list[0]){
	        	var contents = $('.message-panel-body');
		        contents.html("");
		        var temp_str = "";
		        for(var i=0;i<message_list.length;i++){
		            var message = message_list[i];
	                var messageline_html = QWeb.render('MessageLine',{widget: this, message:message_list[i]});
		            temp_str += messageline_html;
		        }
		        contents.html(temp_str)
		        $('.message-panel-body').scrollTop($('.message-panel-body')[0].scrollHeight);
		        $('#message_icon').css("color", "gray");
	        } else{
	        	var contents = $('.message-panel-body');
		        contents.html("");
	        }
	    },
	    user_icon_url(id){
			return '/web/image?model=res.users&id='+id+'&field=image_small';
		},
	});

    var SliderWidget = PosBaseWidget.extend({
        template: 'SliderWidget',
        init: function(parent, options){
            var self = this;
            this._super(parent,options);
            self.click_username = function(){
                self.gui.show_popup('confirm',{
                    'title': _t('Are You Sure You Want to LogOut ?'),
                    'body': _t('When you logout , it destroy current order'),
                    confirm: function(){
                        var order = self.pos.get_order();
                        if(order){
                            self.pos.get_order().destroy();
                        }
                        self.gui.show_screen('login');
                    },
                });
            };
            self.sidebar_button_click = function(){
            	var element = $(this);
            	if(self.gui.get_current_screen() !== "receipt"){
            		if(self.$("#wrapper").hasClass('toggled')){
            			if(self.pos.config.manager_auth_for_menu && self.pos.config.menu_bar_auth.length > 0){
                            var users_pass = [];
                            _.each(self.pos.users, function(user){
                            	self.pos.config.menu_bar_auth.map(function(user_id){
                            		if(user_id == user.id){
                            			if(user.pos_security_pin){
            	                            users_pass.push(user.pos_security_pin);
            	                        }
                            		}
                            	})
                            });
                            if(users_pass && users_pass.length > 0){
                            	self.pos.chrome.screens.products.ask_password(users_pass).then(function(){
                            		element.parent().toggleClass("toggled");
                            		element.find('i').toggleClass('fa fa-chevron-left fa fa-chevron-right');
                                });
                            }else{
                            	self.pos.db.notification('danger',_t('Authentications users passwords not found!'));
                            }
            			}else {
                    		element.parent().toggleClass("toggled");
                    		element.find('i').toggleClass('fa fa-chevron-left fa fa-chevron-right');
            			}
    	        	} else{
    	        		element.parent().removeClass('oe_hidden');
    	        		element.parent().toggleClass("toggled");
    	        		element.find('i').toggleClass('fa fa-chevron-left fa fa-chevron-right');
    	        	}
            	}
        	};
        	self.open_product_screen = function(){
                self.gui.show_screen('product-screen');
                self.close_sidebar();
        	};
        	self.open_sales_deshboard = function(){
        		self.gui.show_screen('pos_dashboard_graph_view');
        		self.close_sidebar();
        	},
        	self.gift_card_screen = function(){
        		self.close_sidebar();
        		self.gui.show_screen('giftcardlistscreen');
        	};
        	self.gift_voucher_screen = function(){
        		self.close_sidebar();
        		self.gui.show_screen('voucherlistscreen');
        	};
        	self.open_order_screen = function(){
        		self.gui.show_screen('orderlist');
        		self.close_sidebar();
        	};
        	self.out_of_stock_detail = function(){
                self.gui.show_screen('product-out-of-stock');
        		self.close_sidebar();
        	};
        	self.user_change_pin = function(){
                self.gui.show_popup('change_user_pin_popup');
                self.close_sidebar();
        	},
        	self.internal_stock_transfer = function(){
                var selectedOrder = self.pos.get_order();
                var currentOrderLines = selectedOrder.get_orderlines();
                self.close_sidebar();
                if(self.pos.stock_pick_typ.length == 0){
                	return self.pos.gui.show_popup('flexi_alert',{
        			    'title':_t('Warning'),
        			    'body':_t("You can not proceed with 'Manage only 1 Warehouse with only 1 stock location' from inventory configuration."),
        			});
                }
                if(currentOrderLines.length == 0){
                	return self.pos.gui.show_popup('flexi_alert',{
        			    'title':_t('Warning'),
        			    'body':_t('You can not proceed with empty cart.'),
        			});
                }
                self.gui.show_popup('int_trans_popup',{'stock_pick_types':self.pos.stock_pick_typ,'location':self.pos.location_ids});
        	};
//        	self.delivery_details_screen = function(){
//        		self.gui.show_screen('delivery_details_screen');
//        		self.close_sidebar();
//        	},
        	self.print_lastorder = function(){
        		self.close_sidebar();
        		if(self.pos.get('pos_order_list').length > 0){
					var last_order_id = Math.max.apply(Math,self.pos.get('pos_order_list').map(function(o){return o.id;}))
					var result = self.pos.db.get_order_by_id(last_order_id);
	                var selectedOrder = self.pos.get_order();
	                var currentOrderLines = selectedOrder.get_orderlines();
	                if(currentOrderLines.length > 0) {
	                	selectedOrder.set_order_id('');
	                    for (var i=0; i <= currentOrderLines.length + 1; i++) {
	                    	_.each(currentOrderLines,function(item) {
	                            selectedOrder.remove_orderline(item);
	                        });
	                    }
	                    selectedOrder.set_client(null);
	                }
	                if(result && result.pos_normal_receipt_html){
	            		selectedOrder.print_receipt_html = result.pos_normal_receipt_html;
	            		selectedOrder.print_xml_receipt_html = result.pos_xml_receipt_html;
	            		selectedOrder.is_reprint = true;
	            		selectedOrder.name = result.pos_reference;
	            		self.gui.show_screen('receipt');
	            	}else{
	            		if (result && result.lines.length > 0) {
		                    partner = null;
		                    if (result.partner_id && result.partner_id[0]) {
		                        var partner = self.pos.db.get_partner_by_id(result.partner_id[0])
		                    }
		                    selectedOrder.set_amount_paid(result.amount_paid);
		                    selectedOrder.set_amount_return(Math.abs(result.amount_return));
		                    selectedOrder.set_amount_tax(result.amount_tax);
		                    selectedOrder.set_amount_total(result.amount_total);
		                    selectedOrder.set_company_id(result.company_id[1]);
		                    selectedOrder.set_date_order(result.date_order);
		                    selectedOrder.set_client(partner);
		                    selectedOrder.set_pos_reference(result.pos_reference);
		                    selectedOrder.set_user_name(result.user_id && result.user_id[1]);
		                    selectedOrder.set_order_note(result.note);
		                    var statement_ids = [];
		                    if (result.statement_ids) {
		                    	var params = {
	                	    		model: 'account.bank.statement.line',
	                	    		method: 'search_read',
	                	    		domain: [['id', 'in', result.statement_ids]],
	                	    	}
	                	    	rpc.query(params, {async: false}).then(function(st){
	                	    		if (st) {
	                            		_.each(st, function(st_res){
	                                    	var pymnt = {};
	                                    	pymnt['amount']= st_res.amount;
	                                        pymnt['journal']= st_res.journal_id[1];
	                                        statement_ids.push(pymnt);
	                            		});
	                                }
	                	    	}).fail(function(){
	                            	self.pos.db.notification('danger',"Connection lost");
	                            });
		                        selectedOrder.set_journal(statement_ids);
		                    }
		                    var params = {
	            	    		model: 'pos.order.line',
	            	    		method: 'search_read',
	            	    		domain: [['id', 'in', result.lines]],
	            	    	}
	            	    	rpc.query(params, {async: false}).then(function(lines){
	            	    		if (lines) {
		                        	_.each(lines, function(line){
		                                var product = self.pos.db.get_product_by_id(Number(line.product_id[0]));
		                                var _line = new models.Orderline({}, {pos: self.pos, order: selectedOrder, product: product});
		                                _line.set_discount(line.discount);
		                                _line.set_quantity(line.qty);
		                                _line.set_unit_price(line.price_unit)
		                                _line.set_line_note(line.line_note);
		                                _line.set_bag_color(line.is_bag);
		                                _line.set_deliver_info(line.deliver);
		                                if(line && line.is_delivery_product){
		                                	_line.set_delivery_charges_color(true);
		                                	_line.set_delivery_charges_flag(true);
		                                }
		                                selectedOrder.add_orderline(_line);
		                        	});
		                        }
	            	    	}).fail(function(){
	                        	self.pos.db.notification('danger',"Connection lost");
	                        });
		                    if(self.pos.config.iface_print_via_proxy){
	                            var receipt = selectedOrder.export_for_printing();
	                            var env = {
	                                    receipt: receipt,
	                                    widget: self,
	                                    pos: self.pos,
	                                    order: self.pos.get_order(),
	                                    paymentlines: self.pos.get_order().get_paymentlines()
	                                }
	                                self.pos.proxy.print_receipt(QWeb.render('XmlReceipt',env));
	                            self.pos.get('selectedOrder').destroy();    //finish order and go back to scan screen
	                        }else{
	                        	self.gui.show_screen('receipt');
	                        }
		                }
	            	}
				} else {
					self.pos.db.notification('danger',_t("No order to print."));
				}
        	};
        	self.open_kitchen_view = function(){
        		self.pos.gui.show_screen('kitchen_screen');
        		self.close_sidebar();
        	},
        	self.pos_graph = function(){
        		self.gui.show_screen('graph_view');
        		self.close_sidebar();
        	};
        	self.x_report = function(){
        		var pos_session_id = [self.pos.pos_session.id];
        		self.pos.chrome.do_action('flexibite_com_advance.pos_x_report',{additional_context:{
                    active_ids:pos_session_id,
                }}).fail(function(){
                	self.pos.db.notification('danger',"Connection lost");
                });
        	};
        	self.payment_summary_report = function(){
        		self.close_sidebar();
        		self.gui.show_popup('payment_summary_report_wizard');
        	};
        	self.product_summary_report = function(){
        		self.close_sidebar();
        		self.gui.show_popup('product_summary_report_wizard');
        	};
        	self.order_summary_report = function(){
        		self.close_sidebar();
        		self.gui.show_popup('order_summary_popup');
        	};
        	self.print_audit_report = function(){
        		self.close_sidebar();
        		self.gui.show_popup('report_popup');
        	};
        	self.print_credit_stmt = function(){
        		self.close_sidebar();
                if(self.pos.get_order().get_client() && self.pos.get_order().get_client().name){
                	self.gui.show_popup('cash_inout_statement_popup');
                    var order = self.pos.get_order();
                    order.set_ledger_click(true);
                }else{
                    self.gui.show_screen('clientlist');
                }
        	};
        	self.today_sale_report = function(){
        		self.close_sidebar();
        		var str_payment = '';
        		var params = {
    	    		model: 'pos.session',
    	    		method: 'get_session_report',
    	    		args: [],
    	    	}
    	    	rpc.query(params, {async: false}).then(function(result){
		            if(result['error']){
		            	self.pos.db.notification('danger',result['error']);
		            }
		            if(result['payment_lst']){
						var temp = [] ;
						for(var i=0;i<result['payment_lst'].length;i++){
							if(result['payment_lst'][i].session_name){
								if(jQuery.inArray(result['payment_lst'][i].session_name,temp) != -1){
									str_payment+="<tr><td style='font-size: 16px;padding: 8px;'>"+result['payment_lst'][i].journals+"</td>" +
									"<td style='font-size: 16px;padding: 8px;'>"+self.format_currency(result['payment_lst'][i].total.toFixed(2))+"</td>" +
								"</tr>";
								}else{
									str_payment+="<tr><td style='font-size:14px;padding: 8px;' colspan='2'>"+result['payment_lst'][i].session_name+"</td></tr>"+
									"<td style='font-size: 16px;padding: 8px;'>"+result['payment_lst'][i].journals+"</td>" +
									"<td style='font-size: 16px;padding: 8px;'>"+self.format_currency(result['payment_lst'][i].total.toFixed(2))+"</td>" +
								"</tr>";
								temp.push(result['payment_lst'][i].session_name);
								}
							}
						}
					}
		            self.gui.show_popup('pos_today_sale',{result:result,str_payment:str_payment});
		    	}).fail(function(){
                	self.pos.db.notification('danger',"Connection lost");
                });
        	};
        },
        close_sidebar: function(){
        	$("#wrapper").addClass('toggled');
            $('#wrapper').find('i').toggleClass('fa fa-chevron-left fa fa-chevron-right');
        },
        hide_widget: function(){
        	$(this.el).hide();
        },
        show_widget: function(){
        	$(this.el).show();
        },
        renderElement: function(){
        	var self = this;
        	self._super();
        	self.el.querySelector('#side_username').addEventListener('click', self.click_username);
        	self.el.querySelector('#slidemenubtn').addEventListener('click', self.sidebar_button_click);
        	self.el.querySelector('a#product-screen').addEventListener('click', self.open_product_screen);
        	if(self.pos.config.enable_gift_card && self.pos.get_cashier().access_gift_card){
        		self.el.querySelector('a#gift_card_screen').addEventListener('click', self.gift_card_screen);
        	}
        	if(self.pos.config.pos_dashboard && self.pos.get_cashier().access_pos_dashboard){
        		self.el.querySelector('a#sales_deshboard').addEventListener('click', self.open_sales_deshboard);
        	}
        	if(self.pos.config.enable_gift_voucher && self.pos.get_cashier().access_gift_voucher){
        		self.el.querySelector('a#gift_voucher_screen').addEventListener('click', self.gift_voucher_screen);
        	}
        	if(self.pos.config.enable_reorder && self.pos.get_cashier().access_reorder){
        		self.el.querySelector('a#order-screen').addEventListener('click', self.open_order_screen);
        	}
        	if(self.pos.config.enable_print_last_receipt && self.pos.get_cashier().access_print_last_receipt){
        		self.el.querySelector('a#print_lastorder').addEventListener('click', self.print_lastorder);
        	}
        	if(self.pos.get_cashier().user_role && self.pos.get_cashier().user_role == 'cook_manager'){
        		self.el.querySelector('a#open_kitchen_view').addEventListener('click', self.open_kitchen_view);
        	}
        	if(self.pos.config.out_of_stock_detail && self.pos.get_cashier().access_out_of_stock_details){
        	    self.el.querySelector('a#out_of_stock').addEventListener('click', self.out_of_stock_detail);
        	}
        	if(self.pos.config.enable_int_trans_stock && self.pos.get_cashier().access_int_trans){
        	    self.el.querySelector('a#stock_transfer').addEventListener('click', self.internal_stock_transfer);
        	}
//        	if(self.pos.config.enable_delivery_charges && self.pos.get_cashier().access_delivery_charges){
//        	    self.el.querySelector('a#delivery_details_screen').addEventListener('click', self.delivery_details_screen);
//        	}
        	if(self.pos.config.enable_change_pin){
        		self.el.querySelector('a#user_change_pin').addEventListener('click', self.user_change_pin);
        	}
        	if(self.el.querySelector('li.pos-graph')){
        		self.el.querySelector('li.pos-graph').addEventListener('click', self.pos_graph);
        	}
        	if(self.el.querySelector('li.x-report')){
        		self.el.querySelector('li.x-report').addEventListener('click', self.x_report);
        	}
        	if(self.el.querySelector('li.today_sale_report')){
        		self.el.querySelector('li.today_sale_report').addEventListener('click', self.today_sale_report);
        	}
        	if(self.el.querySelector('li.payment_summary_report')){
        		self.el.querySelector('li.payment_summary_report').addEventListener('click', self.payment_summary_report);
        	}
        	if(self.el.querySelector('li.product_summary_report')){
        		self.el.querySelector('li.product_summary_report').addEventListener('click', self.product_summary_report);
        	}
        	if(self.el.querySelector('li.order_summary_report')){
        		self.el.querySelector('li.order_summary_report').addEventListener('click', self.order_summary_report);
        	}
        	if(self.el.querySelector('li.print_audit_report')){
        		self.el.querySelector('li.print_audit_report').addEventListener('click', self.print_audit_report);
        	}
        	if(self.el.querySelector('li.print_credit_stmt')){
        		self.el.querySelector('li.print_credit_stmt').addEventListener('click', self.print_credit_stmt);
        	}
        	$('.main_slider-ul > li.main-header-li').click(function() {
        	    $(this).parent().find('ul.content-list-ul').slideToggle();
        	    $(this).find('i').toggleClass('fa fa-angle-down fa fa-angle-right');
//        	    if($('#toggle_image').hasClass('right')){
//        	    	$('#toggle_image').removeClass('right');
//        	    	$('#toggle_image').attr('src','/flexibite_com_advance/static/src/img/icons/angle-down.svg')
//        	    }else{
//        	    	$('#toggle_image').addClass('right');
//        	    	$('#toggle_image').attr('src','/flexibite_com_advance/static/src/img/icons/angle-right.png')
//        	    }
        	});
        },
	});

    var PosCartCountWidget = PosBaseWidget.extend({
        template: 'PosCartCountWidget',
        init: function(parent, options){
            var self = this;
            this._super(parent,options);
            self.show_cart = function(){
            	var order = self.pos.get_order();
            	if(!order || order.is_empty()) {
            		return;
            	}
            	if(self.gui.get_current_screen() != 'products'){
            		var html_data = $('.order-scroller').html();
                	$('.show-left-cart').html('').append(html_data);
                	$('.show-left-cart').toggle("slide");
            	}
            };
        },
        renderElement: function(){
        	var self = this;
        	self._super();
        	$(".pos-cart-info").delegate( "#pos-cart", "click",self.show_cart);
        },
    });

    chrome.HeaderButtonWidget.include({
		renderElement: function(){
	        var self = this;
	        this._super();
	        if(this.action){
	            this.$el.click(function(){
	            	self.gui.show_popup('POS_session_config');
	            });
	        }
	    },
	});

    chrome.OrderSelectorWidget.include({
//    	deleteorder_click_handler: function(event, $el) {
//            var self  = this;
//            $('.show-left-cart').hide();
//            var order = self.pos.get_order();
//            if(order){
//            	order.set_tables();
//            }
//            if(self.gui.get_current_screen() == "receipt"){
//            	return
//            }
//            this._super(event, $el);
//    	},
    	deleteorder_click_handler: function(event, $el) {
            var self  = this;
            $('.show-left-cart').hide();
            if(self.gui.get_current_screen() == "receipt"){
            	return
            }
            var order = this.pos.get_order();
            if(order){
            	order.set_tables();
            }
            var customer_display = this.pos.config.customer_display;
            if (!order) {
                return;
            } else if ( !order.is_empty() ){
                this.gui.show_popup('confirm',{
                    'title': _t('Destroy Current Order ?'),
                    'body': _t('You will lose any data associated with the current order'),
                    confirm: function(){
                        self.pos.delete_current_order();
                        if(customer_display){
                        	order.mirror_image_data(true);
                        }
                        $('#slidemenubtn1').css({'right':'0px'});
                        $('.product-list-container').css('width','100%');
                        $('#wrapper1').addClass('toggled');
                    },
                });
            } else {
                this.pos.delete_current_order();
                if(customer_display){
                	order.mirror_image_data(true);
                }
                $('#slidemenubtn1').css({'right':'0px'});
                $('.product-list-container').css('width','100%');
                $('#wrapper1').addClass('toggled');
            }
        },

    	renderElement: function(){
            var self = this;
            this._super();
            var customer_display = this.pos.config.customer_display;
            this.$('.order-button.select-order').click(function(event){
            	if(self.pos.get_order() && customer_display){
            		self.pos.get_order().mirror_image_data(true);
            	}
            });
            this.$('.neworder-button').click(function(event){
            	if(self.pos.get_order() && customer_display){
            		self.pos.get_order().mirror_image_data(true);
            	}
            });
            this.$('.deleteorder-button').click(function(event){
            	if(self.pos.get_order() && customer_display){
            		self.pos.get_order().mirror_image_data();
            	}
            });
            if(this.pos.config.enable_automatic_lock && self.pos.get_cashier().access_pos_lock){
                var time_interval = this.pos.config.time_interval || 3;
                start_lock_timer(time_interval,self);
            }
            // Click on Manual Lock button
            $('.order-button.lock_button').click(function(){
            	self.gui.show_popup('lock_popup');
            });
            // Click on Unlock button
            $('.unlock_button').click(function(){
                // $('.lock_button').css('background-color', 'rgb(233, 88, 95)');
                $('.freeze_screen').removeClass("active_state");
                $('.unlock_button').hide();
                $('.unlock_button').css('z-index',0);
                self.gui.show_screen('login');
                $('.get-input').focus();
            });
            if(this.pos.config.iface_floorplan && !self.pos.table){
            	this.$('.orders').prepend(QWeb.render('FloorButton',{
            			widget: this
            		},
            	));
            	this.$('.floor-button-back').click(function(){
                    self.gui.show_screen('floors');
                });
//            	if(this.pos.get_order()){
//            		setTimeout(function(){
//            			if(self.pos.get_order().takeaway_note && !self.pos.get_order().finalized){
//            				var el = QWeb.render('TakeAwayName',{
//        	        			widget: self,
//        	        			takeaway_note: self.pos.get_order() ? self.pos.get_order().takeaway_note : false,
//        	        		});
//                    		self.$('.orders').append(el);
//            			}
//            		}, 500);
//            	}
            }
        },
        order_click_handler: function(event,$el) {
        	var self = this;
            this._super(event,$el);
            var order = this.pos.get_order();
            if(order){
            	order.set_tables();
            }
        },
    });

});