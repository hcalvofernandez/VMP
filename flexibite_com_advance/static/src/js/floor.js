odoo.define('flexibite_com_advance.floor', function (require) {
"use strict";

	var floors = require('pos_restaurant.floors')
	var models = require('point_of_sale.models');
	var rpc = require('web.rpc');
	var core = require('web.core');

	var _t = core._t;

	floors.FloorScreenWidget.include({
		show: function(){
	        this._super();
	        setTimeout(function(){
	        	$('#slidemenubtn').hide();
	        }, 10);
		},
		renderElement: function(){
	        var self = this;
	        this._super();
	        this.$('.floor-bottom-button').click(function(event){
	        	var button_name = $(event.currentTarget).data('button-name');
	        	if(button_name){
	        		self.execute_action(button_name);
	        	}else{
	        		alert("Button name undefined.");
	        	}
	        });
		},
		execute_action: function(button_name){
			if(button_name == 'take_away'){
				this.pos.gui.show_popup('take_away_name_popup');
			}else if(button_name == 'delivery'){
				this.create_new_order();
				this.pos.get_order().set_is_delivery_from_floor(true);
				this.pos.chrome.screens.products.confirm_delivery_order();
				this.pos.gui.show_screen('clientlist');
			}
		},
		create_new_order: function(){
			this.pos.table = null;
			var order = new models.Order({},{pos:this.pos});
	        this.pos.get('orders').add(order);
	        this.pos.set('selectedOrder', order);
		},
	});

	floors.TableWidget.include({
        click_handler: function() {

            var self = this;
            var d = new Date($.now());
            var booked_table_id = [];
            var full_date = d.getFullYear()+"-"+(d.getMonth() + 1)+"-"+d.getDate()+" "+d.getHours()+":"+d.getMinutes()+":"+d.getSeconds()
            var params = {
                model: "restaurant.table.reservation",
                method: "search_read",
                domain: [['tbl_reserve_datetime','<=',full_date],['table_reserve_end_datetime','>',full_date]],
            }
            rpc.query(params, {async: false}).then(function(res){
                _.each(res, function(table_booked_data){
                    _.each(table_booked_data.table_ids, function(table_booked_id){
                        booked_table_id.push(table_booked_id)
                    });
                });
            });
            if(booked_table_id.includes(this.table.id)){
                var self = this;
                this.gui.show_popup('confirm',{
                    'title': _t('Reserve This Table ?'),
                    'body': _t('This table is already reserved at that time.'),
                    confirm: function(){
                        var floorplan = self.getParent();
                        if (floorplan.editing) {
                            setTimeout(function(){  // in a setTimeout to debounce with drag&drop start
                                if (!self.dragging) {
                                    if (self.moved) {
                                        self.moved = false;
                                    } else if (!self.selected) {
                                        self.getParent().select_table(self);
                                    } else {
                                        self.getParent().deselect_tables();
                                    }
                                }
                            },50);
                        } else {
                            floorplan.pos.set_table(self.table);
                        }
                        var floorplan = self.getParent();
                        if (floorplan.editing) {
                            setTimeout(function() { // in a setTimeout to debounce with drag&drop start
                                if (!self.dragging) {
                                    if (self.moved) {
                                        self.moved = false;
                                    } else if (!self.selected) {
                                        self.getParent().select_table(self);
                                    } else {
                                        self.getParent().deselect_tables();
                                    }
                                }
                            }, 50);
                        }else {
                            if (self.table.parent_linked_table) {
                                floorplan.pos.set_table(self.table.parent_linked_table);
                            } else {
                                floorplan.pos.set_table(self.table);
                            }
                        }
                    },
                });
            }else{
                self._super()
                var floorplan = this.getParent();
                if (floorplan.editing) {
                    setTimeout(function() { // in a setTimeout to debounce with drag&drop start
                        if (!self.dragging) {
                            if (self.moved) {
                                self.moved = false;
                            } else if (!self.selected) {
                                self.getParent().select_table(self);
                            }
//                            else if(self.selected) {
//                                self.getParent().deselect_tables();
//                            }
                        }
                    }, 50);
                }else {
                    if (this.table.parent_linked_table) {
                        floorplan.pos.set_table(this.table.parent_linked_table);
                    } else {
                        floorplan.pos.set_table(this.table);
                    }
                }
            }
        },
        renderElement: function() {
            var self = this;
            if (!this.table.parent_linked_table) {
                this.table.parent_linked_table = this.pos.get_parent_linked_table(this.table)
            }
            this._super();
        },
    });

});