odoo.define('flexibite_com_advance.db', function (require) {
	"use strict";

	var DB = require('point_of_sale.DB');
	var core = require('web.core');
	var rpc = require('web.rpc');

	var _t = core._t;

	DB.include({
		init: function(options){
			this._super.apply(this, arguments);
			this.currency_symbol = {};
			this.template_by_id = {};
            this.product_attribute_by_id = {};
            this.product_attribute_value_by_id = {};
            this.pay_button_by_id = {};
	        this.group_products = [];
        	this.order_write_date = null;
        	this.order_by_id = {};
        	this.line_by_id = {};
        	this.order_sorted = [];
        	this.order_search_string = "";
        	this.line_search_string = ""
        	this.product_search_string = "";
        	this.all_categories = [];
        	this.product_namelist = [];
        	this.dummy_product_ids = [];
        	this.product_write_date = '';
//        	Gift Card
        	this.card_products = [];
            this.card_write_date = null;
            this.card_by_id = {};
            this.card_sorted = [];
            this.card_search_string = "";
            this.gift_card_cust_search_string = "";
//            Voucher
            this.voucher_write_date = null;
            this.voucher_by_id = {};
            this.voucher_sorted = [];
            this.voucher_search_string = "";

            this.partners_name = [];
            this.partner_by_name = {};
            this.all_partners = [];
            this.modifier_by_id = {};

//            Table Reservation
            this.reserved_table_order_by_id = {};
			this.reserved_table_order_sorted = [];
			this.reserved_table_order_search_string = "";

//          Internal Transfer
            this.picking_type_by_id = {};

//            Cashbox line 
            this.cash_box_line_by_id = {};
	    },
        get_product_by_category: function(category_id){
            var product_ids  = this.product_by_category_id[category_id];
            var list = [];
            if (product_ids) {
                for (var i = 0, len = Math.min(product_ids.length, this.limit); i < len; i++) {
                    list.push(this.product_by_id[product_ids[i]]);
                }
            }
            list = list.sort(function(a, b){
                if(a.display_name > b.display_name){
                    return 1;
                }
                if(a.display_name < b.display_name){
                    return -1;
                }
                return 0;
            });
            return list;
        },
	    add_account_cash_box_line: function(cash_box_lines){
        	var self = this;
        	cash_box_lines.map(function(line){
                self.cash_box_line_by_id[line.id] = line;
            });
        },
	    add_reserved_table_orders: function(orders){
			var updated_count = 0;
			var new_write_date = '';
			for(var i = 0, len = orders.length; i < len; i++){
				var order = orders[i];
				if (!this.reserved_table_order_by_id[order.id]) {
					this.reserved_table_order_sorted.push(order);
				}
				this.reserved_table_order_by_id[order.id] = order;
				updated_count += 1;
			}
			if (updated_count) {
				// If there were updates, we need to completely
				this.reserved_table_order_search_string = "";
				for (var id in this.reserved_table_order_by_id) {
					var order = this.reserved_table_order_by_id[id];
					this.reserved_table_order_search_string += this._reserved_table_search_string(order);
				}
			}
			return updated_count;
		},
		get_reserved_table_orders: function(){
			return this.reserved_table_order_sorted;
		},
		_reserved_table_search_string: function(order){
			var str = order.order_id[1];
			if(order.partner_id){
				str += '|' + order.partner_id[1];
			}
			str = '' + order.id + ':' + str.replace(':','') + '\n';
			return str;
		},
		search_reserve_table: function(query){
			try {
				query = query.replace(/[\[\]\(\)\+\*\?\.\-\!\&\^\$\|\~\_\{\}\:\,\\\/]/g,'.');
				query = query.replace(' ','.+');
				var re = RegExp("([0-9]+):.*?"+query,"gi");
			}catch(e){
				return [];
			}
			var results = [];
			var r;
			for(var i = 0; i < this.limit; i++){
				r = re.exec(this.reserved_table_order_search_string);
				if(r){
					var id = Number(r[1]);
					results.push(this.get_reserved_table_order_by_id(id));
				}else{
					break;
				}
			}
			return results;
		},
		get_reserved_table_order_by_id: function(id){
			return this.reserved_table_order_by_id[id];
		},
	    get_product_by_value_and_products: function(value_id, products){
            var list = [];
            for (var i = 0, len = products.length; i < len; i++) {
                if (products[i] && products[i].attribute_value_ids.indexOf(value_id) != -1){
                    list.push(products[i]);
                }
            }
            return list;
        },

        get_product_attribute_by_id: function(attribute_id){
            return this.product_attribute_by_id[attribute_id];
        },

        get_product_attribute_value_by_id: function(attribute_value_id){
            return this.product_attribute_value_by_id[attribute_value_id];
        },

        get_product_by_ids: function(product_ids){
            var list = [];
            for (var i = 0, len = product_ids.length; i < len; i++) {
                list.push(this.product_by_id[product_ids[i]]);
            }
            return list;
        },


        attribute_by_template_id: function(template_id){
            var template = this.template_by_id[template_id];
            return this.attribute_by_attribute_value_ids(template.attribute_value_ids);
        },

        attribute_by_attribute_value_ids: function(value_ids){
            var attribute_ids = [];
            for (var i = 0; i < value_ids.length; i++){
                var value = this.product_attribute_value_by_id[value_ids[i]];
                if (attribute_ids.indexOf(value.attribute_id[0])==-1){
                    attribute_ids.push(value.attribute_id[0]);
                }
            }
            return attribute_ids;
        },

        add_templates: function(templates){
            for(var i=0 ; i < templates.length; i++){
                var attribute_value_ids = [];
                // store Templates
                this.template_by_id[templates[i].id] = templates[i];

                // Update Product information
                for (var j = 0; j <templates[i].product_variant_ids.length; j++){
                    var product = this.product_by_id[templates[i].product_variant_ids[j]];
                    if(product){
                    	for (var k = 0; k < product.attribute_value_ids.length; k++){
                            if (attribute_value_ids.indexOf(product.attribute_value_ids[k])==-1){
                                attribute_value_ids.push(product.attribute_value_ids[k]);
                            }
                        }
                        product['product_variant_count'] = templates[i].product_variant_count;
                        product['is_primary_variant'] = (j==0);
                        product.temp = templates[i].product_variant_count;
                    }
                }
                this.template_by_id[templates[i].id].attribute_value_ids = attribute_value_ids;
            }
        },

        add_product_attributes: function(product_attributes){
            for(var i=0 ; i < product_attributes.length; i++){
                // store Product Attributes
                this.product_attribute_by_id[product_attributes[i].id] = product_attributes[i];
            }
        },

        add_product_attribute_values: function(product_attribute_values){
            for(var i=0 ; i < product_attribute_values.length; i++){
                // store Product Attribute Values
                this.product_attribute_value_by_id[product_attribute_values[i].id] = product_attribute_values[i];
            }
        },
	    add_picking_types: function(stock_pick_typ){
            var self = this;
            stock_pick_typ.map(function(type){
                self.picking_type_by_id[type.id] = type;
            });
	    },
	    get_picking_type_by_id: function(id){
            return this.picking_type_by_id[id]
        },
	    add_modifiers: function(modifiers){
            for(var i = 0, len = modifiers.length; i < len; i++){
                var modifier = modifiers[i];
                this.modifier_by_id[modifier.id] = modifier;
            }
        },
        get_modifier_by_id: function(id){
            return this.modifier_by_id[id]
        },
	    search_product: function(query){
            try {
                query = query.replace(/[\[\]\(\)\+\*\?\.\-\!\&\^\$\|\~\_\{\}\:\,\\\/]/g,'.');
                query = query.replace(' ','.+');
                var re = RegExp("([0-9]+):.*?"+query,"gi");
            }catch(e){
                return [];
            }
            var results = [];
            for(var i = 0; i < this.limit; i++){
                var r = re.exec(this.product_search_string);
                if(r){
                    var id = Number(r[1]);
                    results.push(this.get_product_by_id(id));
                }else{
                    break;
                }
            }
            return results;
        },
	    get_product_write_date: function(){
            return this.product_write_date || "1970-01-01 00:00:00";
        },
	    get_category_search_list: function(){
            var category_search_list = [];
            _.each(this.all_categories, function(category){
                category_search_list.push({
                    'id':category.id,
                    'value':category.name,
                    'label':category.name,
            	});
            });
            return category_search_list;
        },
	    get_all_categories : function() {
			return this.all_categories;
		},
	    add_categories: function(categories){
	    	this._super(categories);
	    	this.all_categories = categories;
	    },
	    get_supplier_list: function(){
            var supplier_list = [];
            var params = {
                model: 'res.partner',
                method: 'search_read',
                domain: [['supplier','=','True']],
            }
            rpc.query(params, {async: false})
            .then(function(supplier){
                if(supplier && supplier[0]){
                     _.each(supplier, function(each_supplier){
                        supplier_list.push({
                            'id':each_supplier.id,
                            'value':each_supplier.name,
                            'label':each_supplier.name,
                        });
                     });
                }
            });
            return supplier_list;
        },
	    add_quick_payment: function(quick_pays){
	    	var self = this;
	    	quick_pays.map(function(pay){
	    		self.pay_button_by_id[pay.id] = pay
	    	});
	    },
	    get_button_by_id: function(id){
	    	return this.pay_button_by_id[id]
	    },
	    get_product_namelist: function(){
	    	return this.product_namelist;
	    },
	    get_dummy_product_ids: function(){
	    	return this.dummy_product_ids;
	    },
	    add_products: function(products){
            var self = this;
            var new_write_date = '';
            var symbol = this.currency_symbol ? this.currency_symbol.symbol : "$";
            var product;
            for(var i = 0, len = products.length; i < len; i++){
                product = products[i];
                var symbol = this.currency_symbol ? this.currency_symbol.symbol : "$";
                product.list_price = product.lst_price || product.list_price;
                if(product.list_price) {
                	product.price = product.list_price;
                	var unit_name = product.uom_id[1] ? product.uom_id[1] : "";
                	if(product.to_weight){
                		if(this.currency_symbol && this.currency_symbol.position == "after"){
                			$("[data-product-id='"+product.id+"']").find('.price-tag').html(product['list_price'].toFixed(2)+" "+symbol+'/'+unit_name);
                		} else{
                			$("[data-product-id='"+product.id+"']").find('.price-tag').html(symbol+" "+product['list_price'].toFixed(2)+'/'+unit_name);
                		}
                	} else {
                		if(this.currency_symbol && this.currency_symbol.position == "after"){
                			$("[data-product-id='"+product.id+"']").find('.price-tag').html(product['list_price'].toFixed(2)+" "+symbol);
                		} else{
                			$("[data-product-id='"+product.id+"']").find('.price-tag').html(symbol+" "+product['list_price'].toFixed(2)+'/'+unit_name);
                		}
                	}
                	$("[data-product-id='"+product.id+"']").find('.stock_qty').html(product.qty_available);
                    $("[data-product-id='"+product.id+"']").find('.product-name').html(product.display_name);
                }
                product.original_name = product.product_tmpl_id[1];
                if(!product.is_dummy_product){
                	this.product_namelist.push([product.id,product.display_name]);
                }else{
                	this.dummy_product_ids.push(product.id);
                }
                this.product_search_string += this._product_search_string(product);
                if (this.product_write_date && 
                    this.product_by_id[product.id] &&
                    new Date(this.product_write_date).getTime() + 1000 >=
                    new Date(product.write_date).getTime() ) {
                    continue;
                } else if ( new_write_date < product.write_date ) {
                    new_write_date  = product.write_date;
                }
	        }
	        this.product_write_date = new_write_date || this.product_write_date;
            this._super(products);
        },
		notification: function(type, message){
        	var types = ['success','warning','info', 'danger'];
        	if($.inArray(type.toLowerCase(),types) != -1){
        		$('div.span4').remove();
        		var newMessage = '';
        		message = _t(message);
        		switch(type){
        		case 'success' :
        			newMessage = '<i class="fa fa-check" aria-hidden="true"></i> '+message;
        			break;
        		case 'warning' :
        			newMessage = '<i class="fa fa-exclamation-triangle" aria-hidden="true"></i> '+message;
        			break;
        		case 'info' :
        			newMessage = '<i class="fa fa-info" aria-hidden="true"></i> '+message;
        			break;
        		case 'danger' :
        			newMessage = '<i class="fa fa-ban" aria-hidden="true"></i> '+message;
        			break;
        		}
	        	$('body').append('<div class="span4 pull-right">' +
	                    '<div class="alert alert-'+type+' fade">' +
	                    newMessage+
	                   '</div>'+
	                 '</div>');
        	    $(".alert").removeClass("in").show();
        	    $(".alert").delay(200).addClass("in").fadeOut(5000);
        	}
        },
        add_orders: function(orders){
            var updated_count = 0;
            var new_write_date = '';
            this.pos_orders = orders;
            for(var i = 0, len = orders.length; i < len; i++){
                var order = orders[i];
                if (    this.order_write_date && 
                        this.order_by_id[order.id] &&
                        new Date(this.order_write_date).getTime() + 1000 >=
                        new Date(order.write_date).getTime() ) {
                    continue;
                } else if ( new_write_date < order.write_date ) { 
                    new_write_date  = order.write_date;
                }
                if (!this.order_by_id[order.id]) {
                    this.order_sorted.push(order.id);
                }
                this.order_by_id[order.id] = order;
                updated_count += 1;
            }
            this.order_write_date = new_write_date || this.order_write_date;
            if (updated_count) {
                // If there were updates, we need to completely 
                this.order_search_string = "";
                for (var id in this.order_by_id) {
                    var order = this.order_by_id[id];
                    this.order_search_string += this._order_search_string(order);
                }
            }
            return updated_count;
        },
        _order_search_string: function(order){
            var str =  order.name;
            if(order.pos_reference){
                str += '|' + order.pos_reference;
            }
            if(order.partner_id.length > 0){
                str += '|' + order.partner_id[1];
            }
            str = '' + order.id + ':' + str.replace(':','') + '\n';
            return str;
        },
        get_order_write_date: function(){
            return this.order_write_date;
        },
        get_order_by_id: function(id){
            return this.order_by_id[id];
        },
        search_order: function(query){
            try {
                query = query.replace(/[\[\]\(\)\+\*\?\.\-\!\&\^\$\|\~\_\{\}\:\,\\\/]/g,'.');
                query = query.replace(' ','.+');
                var re = RegExp("([0-9]+):.*?"+query,"gi");
            }catch(e){
                return [];
            }
            var results = [];
            var r;
            for(var i = 0; i < this.limit; i++){
                r = re.exec(this.order_search_string);
                if(r){
                    var id = Number(r[1]);
                    results.push(this.get_order_by_id(id));
                }else{
                    break;
                }
            }
            return results;
        },
        _line_search_string: function(line){
        	var str =  line.name;
        	if(line.product_id.length > 0){
                str += '|' + line.product_id[1];
            }
        	if(line.order_id.length > 0){
                str += '|' + line.order_id[1];
            }
        	str = '' + line.id + ':' + str.replace(':','') + '\n';
            return str;
        },
        search_item: function(query){
            try {
                query = query.replace(/[\[\]\(\)\+\*\?\.\-\!\&\^\$\|\~\_\{\}\:\,\\\/]/g,'.');
                query = query.replace(' ','.+');
                var re = RegExp("([0-9]+):.*?"+query,"gi");
            }catch(e){
                return [];
            }
            var results = [];
            var r;
            for(var i = 0; i < this.limit; i++){
                r = re.exec(this.line_search_string);
                if(r){
                    var id = Number(r[1]);
                    results.push(this.line_by_id[id]);
                }else{
                    break;
                }
            }
            return results;
        },
        add_partners: function(partners){
			var self = this;
			for(var i = 0, len = partners.length; i < len; i++){
	            var partner = partners[i];
	            var old_partner = this.partner_by_id[partner.id];
	            if(partners && old_partner && partner.total_remaining_points !== old_partner.total_remaining_points){
	            	old_partner['total_remaining_points'] = partner.total_remaining_points;
	            }
	            if(partner.name){
        			self.partners_name.push(partner.name);
        			self.partner_by_name[partner.name] = partner;
        		}
	            this.gift_card_cust_search_string += this._gift_card_cust_search_string(partner);
			}
			if(partners.length > 0){
        		_.extend(this.all_partners, partners)
        	}
			return this._super(partners);
		},
		get_partners_name: function(){
        	return this.partners_name;
        },
        get_partner_by_name: function(name){
            if(this.partner_by_name[name]){
                return this.partner_by_name[name];
            }
            return undefined;
        },
        _gift_card_cust_search_string: function(partner){
        	var str = ""
        	if(partner){
        		if(partner.name){
        			str +=  partner.name;
        		}
                if(partner.mobile){
                    str += '|' + partner.mobile;
                }
                if(partner.email){
                    str += '|' + partner.email;
                }
                str = '' + partner.id + ':' + str.replace(':','') + '\n';
                return str;
            } else{
//                var str = "";
                return str;
            }
        },
        search_gift_card_customer: function(query){
            try {
                query = query.replace(/[\[\]\(\)\+\*\?\.\-\!\&\^\$\|\~\_\{\}\:\,\\\/]/g,'.');
                query = query.replace(' ','.+');
                var re = RegExp("([0-9]+):.*?"+query,"gi");
            }catch(e){
                return [];
            }
            var results = [];
            var r;
            for(var i = 0; i < this.limit; i++){
                r = re.exec(this.gift_card_cust_search_string);
                if(r){
                    var id = Number(r[1]);
                    results.push(this.partner_by_id[id]);
                }else{
                    break;
                }
            }
            return results;
        },
        add_giftcard: function(gift_cards){
            var updated_count = 0;
            var new_write_date = '';
            for(var i = 0, len = gift_cards.length; i < len; i++){
                var gift_card = gift_cards[i];
                if (    this.card_write_date && 
                        this.card_by_id[gift_card.id] &&
                        new Date(this.card_write_date).getTime() + 1000 >=
                        new Date(gift_card.write_date).getTime() ) {
                    continue;
                } else if ( new_write_date < gift_card.write_date ) { 
                    new_write_date  = gift_card.write_date;
                }
                if (!this.card_by_id[gift_card.id]) {
                    this.card_sorted.push(gift_card.id);
                }
                this.card_by_id[gift_card.id] = gift_card;
                updated_count += 1;
            }
            this.card_write_date = new_write_date || this.card_write_date;
            if (updated_count) {
                // If there were updates, we need to completely 
                this.card_search_string = "";
                for (var id in this.card_by_id) {
                    var gift_card = this.card_by_id[id];
                    this.card_search_string += this._card_search_string(gift_card);
                }
            }
            return updated_count;
        },
        _card_search_string: function(gift_card){
            var str =  gift_card.card_no;
            if(gift_card.customer_id){
                str += '|' + gift_card.customer_id[1];
            }
            str = '' + gift_card.id + ':' + str.replace(':','') + '\n';
            return str;
        },
        get_card_write_date: function(){
            return this.card_write_date;
        },
        get_card_by_id: function(id){
            return this.card_by_id[id];
        },
        search_gift_card: function(query){
            try {
                query = query.replace(/[\[\]\(\)\+\*\?\.\-\!\&\^\$\|\~\_\{\}\:\,\\\/]/g,'.');
                query = query.replace(' ','.+');
                var re = RegExp("([0-9]+):.*?"+query,"gi");
            }catch(e){
                return [];
            }
            var results = [];
            var r;
            for(var i = 0; i < this.limit; i++){
                r = re.exec(this.card_search_string);
                if(r){
                    var id = Number(r[1]);
                    results.push(this.get_card_by_id(id));
                }else{
                    break;
                }
            }
            return results;
        },
        add_gift_vouchers: function(gift_vouchers){
            var updated_count = 0;
            var new_write_date = '';
            for(var i = 0, len = gift_vouchers.length; i < len; i++){
                var gift_voucher = gift_vouchers[i];
                if (    this.voucher_write_date &&
                        this.voucher_by_id[gift_voucher.id] &&
                        new Date(this.voucher_write_date).getTime() + 1000 >=
                        new Date(gift_voucher.write_date).getTime() ) {
                    continue;
                } else if ( new_write_date < gift_voucher.write_date ) {
                    new_write_date  = gift_voucher.write_date;
                }
                if (!this.voucher_by_id[gift_voucher.id]) {
                    this.voucher_sorted.push(gift_voucher.id);
                }
                this.voucher_by_id[gift_voucher.id] = gift_voucher;
                updated_count += 1;
            }
            this.voucher_write_date = new_write_date || this.voucher_write_date;
            if (updated_count) {
                // If there were updates, we need to completely
                this.voucher_search_string = "";
                for (var id in this.voucher_by_id) {
                    var gift_voucher = this.voucher_by_id[id];
                    this.voucher_search_string += this._voucher_search_string(gift_voucher);
                }
            }
            return updated_count;
        },
        _voucher_search_string: function(gift_voucher){
            var str =  gift_voucher.voucher_name;
            if(gift_voucher.voucher_code){
                str += '|' + gift_voucher.voucher_code;
            }
            str = '' + gift_voucher.id + ':' + str.replace(':','') + '\n';
            return str;
        },
        get_voucher_write_date: function(){
            return this.voucher_write_date;
        },
        get_voucher_by_id: function(id){
            return this.voucher_by_id[id];
        },
        search_gift_vouchers: function(query){
            try {
                query = query.replace(/[\[\]\(\)\+\*\?\.\-\!\&\^\$\|\~\_\{\}\:\,\\\/]/g,'.');
                query = query.replace(' ','.+');
                var re = RegExp("([0-9]+):.*?"+query,"gi");
            }catch(e){
                return [];
            }
            var results = [];
            var r;
            for(var i = 0; i < this.limit; i++){
                r = re.exec(this.voucher_search_string);
                if(r){
                    var id = Number(r[1]);
                    results.push(this.get_voucher_by_id(id));
                }else{
                    break;
                }
            }
            return results;
        },
	});

});