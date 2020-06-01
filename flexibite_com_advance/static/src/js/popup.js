odoo.define('flexibite_com_advance.popup', function (require) {
    "use strict";

    var gui = require('point_of_sale.gui');
    var rpc = require('web.rpc');
    var PosBaseWidget = require('point_of_sale.BaseWidget');
    var PopupWidget = require('point_of_sale.popups');
    var core = require('web.core');
    var chrome = require('point_of_sale.chrome');
    var models = require('point_of_sale.models');
    var framework = require('web.framework');
    var utils = require('web.utils');
    var field_utils = require('web.field_utils');
    var round_pr = utils.round_precision;
    var round_di = utils.round_decimals;

    var _t = core._t;
    var QWeb = core.qweb;

    //flexi alert popup
    var AlertPopupWidget = PopupWidget.extend({
        template:'AlertPopupWidget',
        show: function(options){
            this._super(options);
            this.gui.play_sound('bell');
        },
    });
    gui.define_popup({name:'flexi_alert', widget: AlertPopupWidget});

    var ChangeUserPinPopupWidget = PopupWidget.extend({
        template: 'ChangeUserPinPopupWidget',
        show: function(options){
            options = options || {};
            this._super(options);
            $('#user_old_pin, #user_new_pin, #user_confirm_pin').keypress(function (e) {
                if (e.which != 8 && e.which != 0 && (e.which < 48 || e.which > 57) && e.which != 46) {
                    return false;
                }
            });
        },
        click_confirm:function(){
            var self = this;
            var old_pin = $('#user_old_pin').val() || false;
            var new_pin = $('#user_new_pin').val() || false;
            var confirm_pin = $('#user_confirm_pin').val() || false;
            var cashier = self.pos.get_cashier() || false;
            if(old_pin && new_pin && confirm_pin){
                if(cashier && cashier.pos_security_pin){
                    if(cashier.pos_security_pin == old_pin){
                        if(new_pin == confirm_pin){
                            if(confirm_pin == old_pin){
                                self.pos.db.notification('danger',"New PIN can not be same as previous one!");
                                return
                            }
                            var params = {
                                model: 'res.users',
                                method: 'write',
                                args: [cashier.id,{'pos_security_pin' : confirm_pin}],
                            }
                            rpc.query(params, {async: false})
                            .then(function(res){
                                if(res){
                                    self.pos.db.notification('success',"PIN changed successfully");
                                    cashier.pos_security_pin = confirm_pin;
                                    self.gui.close_popup();
                                }
                            }).fail(function(){
                                self.pos.db.notification('danger',"Connection lost");
                            });
                        } else{
                            self.pos.db.notification('danger',"New and Confirm PIN should be same!");
                            return;
                        }
                    } else{
                        self.pos.db.notification('danger',"Old PIN is wrong!");
                        return;
                    }
                } else{
                    self.pos.db.notification('danger',"Connection lost");
                    return
                }
            }
        },
    });
    gui.define_popup({name:'change_user_pin_popup', widget: ChangeUserPinPopupWidget});

    var ErrorPopup = PopupWidget.extend({
        template:'ErrorPopup',
        events: {
            'click #password_ok_button':  'click_password_ok_button',
        },
        click_password_ok_button: function(){
            var self = this;
            this.gui.close_popup();
            if(self.gui.current_screen && self.gui.current_screen.order_widget &&
                    self.gui.current_screen.order_widget.numpad_state){
                self.gui.current_screen.order_widget.numpad_state.reset();
            }
        },
    });
    gui.define_popup({name:'error_popup', widget: ErrorPopup});

    var AddressMapPopupWidget = PopupWidget.extend({
        template: 'AddressMapPopupWidget',
        show: function(options){
            var self = this;
            self._super(options);
            self.renderElement();
            self.options = options;
            $("#search_map_box_popup").focus(function() {
                if(navigator.onLine){
                    geolocate();
                }
            });
            if(options.partner){
                initpopupMap();
                codeAddress(options.partner.address);
            }
        },
        click_confirm: function(){
            var self = this;
            var add_for_base_map = $("#search_map_box_popup").val();
            if(add_for_base_map){
                codeAddress(add_for_base_map);
                initMap();
                self._super();
            }
        },
        click_cancel: function(){
            this._super();
            codeAddress(this.options.partner.address);
            initMap();
        },
    });
    gui.define_popup({name:'map_popup', widget: AddressMapPopupWidget});

    var TakeAwayNamePopupWidget = PopupWidget.extend({
        template: 'TakeAwayNamePopupWidget',
        show: function(options){
            this._super(options);
            this.options = options || {};
            this.renderElement();
            this.$el.find('input.take_away_name').focus();
        },
        click_confirm: function(){
            var name = this.$el.find('input.take_away_name').val();
            if(!name){
                this.$el.find('input.take_away_name').focus();
                return this.pos.db.notification('danger',_t('Please fill value.'));
            }else{
                this.pos.chrome.screens.floors.create_new_order();
                this.pos.get_order().set_is_takeaway_from_floor(true);
                this.pos.get_order().takeaway_note = name;
                this.pos.get_order().set_order_note(_t('Take Away: ') + name);
                $('textarea#order_note').text(_t('Take Away: ') + name);
                this.pos.chrome.screens.products.$el.find('div#take_away').addClass('selected-menu');
                this.gui.close_popup();
                if(this.pos.get_order().takeaway_note){
                    var el = QWeb.render('TakeAwayName',{
                        widget: this,
                        takeaway_note: this.pos.get_order() ? this.pos.get_order().takeaway_note : false,
                    });
                    this.pos.chrome.$el.find('.orders').append(el);
                }
            }
        },
    });
    gui.define_popup({name:'take_away_name_popup', widget: TakeAwayNamePopupWidget});

    var OrderLineNotePopupWidget = PopupWidget.extend({
        template: 'OrderLineNotePopupWidget',
        events: _.extend({}, PopupWidget.prototype.events, {
            'click .note_detail': 'add_note_into_textarea',
        }),
        show: function(options){
            var self = this;
            self._super(options);
            var order = self.pos.get_order();
            this.line = options && options.line || false;
            $("textarea.orderline_note").val('');
            self.renderElement();
            if(self.pos.gui.get_current_screen() == 'payment'){
                $("textarea.orderline_note").focus(function() {
                    $('body').off('keypress', self.pos.gui.screen_instances.payment.keyboard_handler);
                    $('body').off('keydown',self.pos.gui.screen_instances.payment.keyboard_keydown_handler);
                });
                $("textarea.orderline_note").focusout(function() {
                    $('body').off('keypress', self.keyboard_handler).keypress(self.pos.gui.screen_instances.payment.keyboard_handler);
                    $('body').off('keydown', self.keyboard_keydown_handler).keydown(self.pos.gui.screen_instances.payment.keyboard_keydown_handler);
                });
            }
            if(this.line){
                if(this.line && this.line.get_note()){
                    $('.orderline_note').val(this.line.get_note());
                }else{
                    $('.orderline_note').val('');
                }
            }
            if(!this.line){
                if(order.get_order_note()){
                    $('.orderline_note').val(order.get_order_note());
                }else{
                    $('.orderline_note').val('');
                }
            }
            $('.orderline_note').focus();
        },
        add_note_into_textarea: function(event){
            var self = this;
            var id = Number($(event.currentTarget).attr('id'));
            if(id){
                var note = _.find(self.pos.pre_notes, function(pre_note){ return pre_note.id === id });
                if(note.name){
                    var note_msg = '';
                    if($('.orderline_note').val()){
                        note_msg = $('.orderline_note').val() +', ';
                    }
                    $('.orderline_note').val(note_msg + note.name);
                    $('.orderline_note').focus();
                }
            }
        },
        click_confirm: function(){
            var self = this;
            var order = self.pos.get_order();
            var note_text = $('.orderline_note').val();
            if(this.line){
                this.line.set_note(note_text);
            }else{
                $('#order_note').val(note_text);
                order.set_order_note(note_text);
            }
            order.mirror_image_data();
            this.gui.close_popup();
        },
    });
    gui.define_popup({name:'line_note_popup', widget: OrderLineNotePopupWidget});

//  order note popup for kitchen screen
    var KitchenLineNotePopupWidget = PopupWidget.extend({
        template: 'KitchenLineNotePopupWidget',
        show: function(options){
            var self = this;
            options = options || {};
            this._super(options);
            this.renderElement();
            var order_note = options.note || ' ';
            if(order_note){
                $('#Order_line_note').text(order_note);
            }
        },
        click_confirm: function(){
            this.gui.close_popup();
        },
    });
    gui.define_popup({name:'kitchen_line_note_popup', widget: KitchenLineNotePopupWidget});

    var DeliervyInfoPopupWidget = PopupWidget.extend({
        template: 'DeliervyInfoPopupWidget',
        show: function(options){
            var self = this;
            options = options || {};
            this._super(options);
            this.renderElement();
            var order = self.pos.get_order();
            self.$(".txt_delivery_date").datepicker({
                minDate: 0,
                onSelect: function(dateText, inst) {
                    order.set_delivery_date(dateText);
                },
            });
            self.$(".txt_delivery_time").timepicker({
                'timeFormat': 'h:i A',
            });
        },
        click_confirm: function(){
            var self = this;
            var order = self.pos.get_order();
            var is_deliver = order.get_is_delivery();
            var delivery_user_id = $('.select_delivery_user').val();
            var time = $(".txt_delivery_time").val();
            if(time){
                order.set_delivery_time(time);
                order.set_delivery_type('pending');
            }
            var address = $('#txt_delivery_address').val();
            if(address){
                order.set_delivery_address(address);
            }
            var delivery_user_id = Number($('.select_delivery_user').val());
            if(is_deliver && delivery_user_id == 0){
                return self.pos.db.notification('danger',_t('Please select delivery user to validate order!'));
            }else{
                order.set_delivery_user_id(delivery_user_id);
            }
            self.gui.close_popup();
//	    	return self.pos.chrome.screens.products.send_to_kitchen();
            return self.pos.chrome.screens.payment.unpaid_draft_order();
        },
    });
    gui.define_popup({name:'delivery_info', widget: DeliervyInfoPopupWidget});

    var ProductNotePopupWidget = PopupWidget.extend({
        template: 'ProductNotePopupWidget',
        show: function(options){
            options = options || {};
            this._super(options);
            this.renderElement();
            var order    = this.pos.get_order();
            var selected_line = order.get_selected_orderline();
            $('textarea#textarea_note').focus();
            $('textarea#textarea_note').html(selected_line.get_line_note());
        },
        click_confirm: function(){
            var order    = this.pos.get_order();
            var selected_line = order.get_selected_orderline();
            var value = this.$('#textarea_note').val();
            if(value){
                selected_line.set_line_note(value);
                this.gui.close_popup();
            } else {
                this.$('#textarea_note').focus();
            }
        },
        renderElement: function() {
            var self = this;
            this._super();
        },
    });
    gui.define_popup({name:'add_note_popup', widget: ProductNotePopupWidget});

    var ReorderProductPopupWidget = PopupWidget.extend({
        template: 'ReorderProductPopupWidget',
        show: function(options){
            var self = this;
            options = options || {};
            var lines = options.order_lines || [];
            self.order_lines = [];
            _.each(lines,function(line){
                if(line.product_id[0]){
                    var product = self.pos.db.get_product_by_id(line.product_id[0]);
//	        		if(product && self.pos.get_order().is_sale_product(product)){
                    if(product && !product.is_dummy_product){
                        self.order_lines.push(line);
                    }
                }
            });
            self.old_order = options.old_order || "";
            self._super(options);
            self.renderElement();
        },
        click_confirm: function(){
            var self = this;
            var order = self.pos.get_order();
            var selected_ids = [];
            var flag = false;
            $('.line-selected').map(function(ev){
                var id = parseInt($(this).attr('id'));
                if(id){
                    selected_ids.push(id);
                }
            });
            if(selected_ids && selected_ids[0]){
                order.empty_cart();
                order.set_client(null);
                var order = self.pos.get_order();
                selected_ids.map(function(id){
                    var line = _.find(self.order_lines, function(obj) { return obj.id == id});
                    var qty = Number($(".popup-product-list tbody").find('tr#'+id+'').find('.js_quantity').val());
                    if(line && qty > 0){
                        if(line.product_id && line.product_id[0]){
                            var product = self.pos.db.get_product_by_id(line.product_id[0]);
                            if(product && order.is_sale_product(product)){
                                flag = true;
                                order.add_product(product, {
                                    quantity: qty,
                                });
                                var selected_orderline = order.get_selected_orderline();
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
                                            }, modifier.qty * qty);
                                        });
                                        selected_orderline.set_unit_price(line.price_unit);
                                    }
                                });
                            }
                        }
                    }
                });
                if(flag){
                    if(self.old_order && self.old_order.partner_id && self.old_order.partner_id[0]){
                        var partner = self.pos.db.get_partner_by_id(self.old_order.partner_id[0]);
                        if(partner){
                            order.set_client(partner);
                        }
                    }else{
                        order.set_client(null);
                    }
                    self.gui.close_popup();
                    self.gui.show_screen("products");
                } else{
                    self.pos.db.notification('info',_t('Please select products and try again!'));
                }
            }
        },
        renderElement: function() {
            var self = this;
            this._super();
            $('.js_quantity-reorder').click(function(ev){
                ev.preventDefault();
                var $link = $(ev.currentTarget);
                var $input = $link.parent().parent().find("input");
                var min = parseFloat($input.data("min") || 1);
                var max = parseFloat($input.data("max") || $input.val());
                var total_qty = parseFloat($input.data("total-qty") || 0);
                var quantity = ($link.has(".fa-minus").length ? -1 : 1) + parseFloat($input.val(),10);
                $input.val(quantity > min ? (quantity < max ? quantity : max) : min);
                $input.change();
                return false;
            });
            $('.product_line').click(function(event){
                if($(this).hasClass('line-selected')){
                    $(this).removeClass('line-selected');
                }else{
                    $(this).addClass('line-selected');
                }
            });
            $('.remove_line').click(function(){
                $(this).parent().remove();
                if($('.product_line').length == 0){
                    self.gui.close_popup();
                }
            });
        },
    });
    gui.define_popup({name:'duplicate_product_popup', widget: ReorderProductPopupWidget});

    var CreateProductPopupWidget = PopupWidget.extend({
        template: 'CreateProductPopupWidget',
        show: function(options){
            var self = this;
            self._super(options);
            self.renderElement();
            self.uploaded_picture = null;
            $('#prod_name').focus();
        },
        click_confirm: function(){
            var self = this;
            self.save_product_details();
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
        resize_image_to_dataurl: function(img, maxwidth, maxheight, callback){
            img.onload = function(){
                var canvas = document.createElement('canvas');
                var ctx    = canvas.getContext('2d');
                var ratio  = 1;
                if (img.width > maxwidth) {
                    ratio = maxwidth / img.width;
                }
                if (img.height * ratio > maxheight) {
                    ratio = maxheight / img.height;
                }
                var width  = Math.floor(img.width * ratio);
                var height = Math.floor(img.height * ratio);

                canvas.width  = width;
                canvas.height = height;
                ctx.drawImage(img,0,0,width,height);

                var dataurl = canvas.toDataURL();
                callback(dataurl);
            };
        },
        save_product_details: function() {
            var self = this;
            var fields = {};
            this.$('.product-data .detail').each(function(idx,el){
                fields[el.name] = el.value || false;
            });
            if (self.uploaded_picture) {
                fields['image'] = self.uploaded_picture;
            }
            if (!fields.name) {
                self.pos.db.notification('danger',_t('A Product Name Is Required'));
                $('#prod_name').focus();
                this.$('#prod_name').animate({
                    color: 'red',
                }, 1000, 'linear', function() {
                    $(this).css('color','#555');
                });
            } else if (!fields.uom_id){
                return self.pos.db.notification('danger',_t('A Product UOM Is Required'));
            } else {
                fields['available_in_pos'] = true;
                var params = {
                        model: 'product.template',
                        method: 'create_from_ui',
                        args: [fields],
                    }
                rpc.query(params, {async: false}).then(function(product_id){
                    if(product_id){
                        self.pos.load_new_products()
                        var product = self.pos.db.get_product_by_id(product_id);
                        if(product){
                            var all_products = self.pos.db.get_product_by_category(0);
                            $('.product_list_manage').html(QWeb.render('ProductList',{widget: self,products: all_products}));
                            self.gui.show_popup('show_product_popup',{'product':product});
                        }
                    }
                }).fail(function (error, event){
                    if(error.data && error.data.message){
                        self.pos.db.notification('danger',error.data.message);
                    } else {
                        self.pos.db.notification('danger','Connection lost');
                    }
                });
            }
        },
        renderElement: function(){
            var self = this;
            self._super();
            $('.product-image-uploader').on('change',function(event){
                self.load_image_file(event.target.files[0],function(res){
                    if (res) {
                        self.uploaded_picture = res;
                        $('.create-product-img').html('');
                        $('.create-product-img').append("<img src='"+res+"'>");
                    }
                });
            });
        },
    });
    gui.define_popup({name:'create_product_popup', widget: CreateProductPopupWidget});

    var ShowProductPopupWidget = PopupWidget.extend({
        template: 'ShowProductPopupWidget',
        show: function(options){
            var self = this;
            options = options || {};
            self.product = options.product;
            self.uploaded_picture = null;
            this._super(options);
            this.renderElement();
        },
        renderElement: function() {
            var self = this;
            this._super();
            $('.edit-product').click(function(){
                if($(this).parent().parent().find('.details-container').hasClass('edit-current-product')){
                    $(this).children().removeClass('fa-floppy-o').addClass('fa-pencil-square-o');
                    $(this).parent().parent().find('.details-container').removeClass('edit-current-product');
                    $(this).parent().parent().find('.product-details-box .product-detail .label-value').css("display","block");
                    $(this).parent().parent().find('.product-details-box .product-detail input').css("display","none");
                    $(this).parent().parent().find('.product-details-box .product-detail select').css("display","none");
                    self.save_product();
                }else{
                    $(this).children().removeClass('fa-pencil-square-o').addClass('fa-floppy-o');
                    $(this).parent().parent().find('.details-container').addClass('edit-current-product');
                    $(this).parent().parent().find('.product-details-box .product-detail .product-uom').attr("disabled","disabled");
                    $(this).parent().parent().find('.product-details-box .product-detail .label-value').css("display","none");
                    $(this).parent().parent().find('.product-details-box .product-detail input').css("display","block");
                    $(this).parent().parent().find('.product-details-box .product-detail select').css("display","block");
                }
            });
            $('.edit-product-image-uploader').on('change',function(event){
                self.load_image_file(event.target.files[0],function(res){
                    if (res) {
                        self.uploaded_picture = res;
                        $('.create-product-img').html('');
                        $('.create-product-img').append("<img src='"+res+"'>");
                    }
                });
            });
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
        resize_image_to_dataurl: function(img, maxwidth, maxheight, callback){
            img.onload = function(){
                var canvas = document.createElement('canvas');
                var ctx    = canvas.getContext('2d');
                var ratio  = 1;

                if (img.width > maxwidth) {
                    ratio = maxwidth / img.width;
                }
                if (img.height * ratio > maxheight) {
                    ratio = maxheight / img.height;
                }
                var width  = Math.floor(img.width * ratio);
                var height = Math.floor(img.height * ratio);

                canvas.width  = width;
                canvas.height = height;
                ctx.drawImage(img,0,0,width,height);

                var dataurl = canvas.toDataURL();
                callback(dataurl);
            };
        },
        save_product: function(){
            var self = this;
            var fields = {};
            $('.product-data .detail').each(function(idx,el){
                if(el.name != 'name'){
                    fields[el.name] = el.value || false;
                }
            });
            if (self.uploaded_picture) {
                fields['image'] = self.uploaded_picture.split(',')[1];
            }
            var params = {
                model: 'product.product',
                method: 'write',
                args: [self.product.id,fields],
            }
            rpc.query(params, {async: false}).then(function(result){
                if(result){
                    for (var key in fields) {
                        if(key == 'categ_id'){
                            var product_categories = self.pos.product_categories;
                            var prod_categ = _.find(product_categories, function(product_category) { return product_category.id == fields[key]});
                            if(prod_categ){
                                self.product['categ_id'] = [prod_categ.id, prod_categ.name];
                            }
                        } else if(key == 'pos_categ_id'){
                            var pos_categories = self.pos.db.get_all_categories();
                            var pos_categ = _.find(pos_categories, function(pos_category) { return pos_category.id == fields[key]});
                            if(pos_categ){
                                self.product['pos_categ_id'] = [pos_categ.id, pos_categ.name];
                            }
                        } else if(key == 'uom_id'){
                            var product_uoms = self.pos.units;
                            var pos_uom = _.find(product_uoms, function(pro_uom) { return pro_uom.id == fields[key]});
                            if(pos_uom){
                                self.product['uom_id'] = [pos_uom.id, pos_uom.name];
                            }
                        } else {
                            self.product[key] = fields[key];
                        }
                    }
                    self.pos.db.notification('success',_t('Product saved successfully.'));
                    self.renderElement();
                    var all_products = self.pos.db.get_product_by_category(0);
                    $('.product_list_manage').html(QWeb.render('ProductList',{widget: self,products: all_products}));
                }
            }).fail(function (type, error){
                if(error.data && error.data.message){
                    self.pos.db.notification('danger',error.data.message);
                } else {
                    self.pos.db.notification('danger','Connection lost');
                }
                $('.edit-product').children().removeClass('fa-pencil-square-o').addClass('fa-floppy-o');
                $('.edit-product').parent().parent().find('.details-container').addClass('edit-current-product');
                $('.edit-product').parent().parent().find('.product-details-box .product-detail .label-value').css("display","none");
                $('.edit-product').parent().parent().find('.product-details-box .product-detail input').css("display","block");
                $('.edit-product').parent().parent().find('.product-details-box .product-detail select').css("display","block");
            });
        },
    });
    gui.define_popup({name:'show_product_popup', widget: ShowProductPopupWidget});

    var ProductQtyPopupWidget = PopupWidget.extend({
        template: 'ProductQtyPopupWidget',
        show: function(options){
            options = options || {};
            this.prod_info_data = options.prod_info_data || '';
            this.total_qty = options.total_qty || '';
            this._super(options);
            this.renderElement();
        },
    });
    gui.define_popup({name:'product_qty_popup', widget: ProductQtyPopupWidget});

    /*Return order*/
    var PosReturnOrderOption = PopupWidget.extend({
        template: 'PosReturnOrderOption',
        show: function(options){
            var self = this;
            options = options || {};
            this._super(options);
            this.renderElement();
            $('.close_btn').click(function(){
                var selectedOrder = self.pos.get_order();
                if(selectedOrder){
                    $("div#sale_mode").click();
                }
                self.gui.close_popup();
            });
            $('#choice_without_receipt').click(function(event){
                var selectedOrder = self.pos.get_order();
                if(selectedOrder){
                    selectedOrder.change_mode('missing');
                    self.gui.close_popup();
                }
            });
            $('#choice_with_receipt').click(function(){
                self.gui.close_popup();
                self.gui.show_popup('pos_return_order');
            });
        },
    });
    gui.define_popup({name:'PosReturnOrderOption', widget: PosReturnOrderOption});

    var PosReturnOrder = PopupWidget.extend({
        template: 'PosReturnOrder',
        init: function(parent, args) {
            var self = this;
            this._super(parent, args);
            this.options = {};
            this.line = [];
            this.select_item = function(e){
                self.selected_item($(this).parent());
            };
            this.update_return_product_qty = function(ev){
                ev.preventDefault();
                var $link = $(ev.currentTarget);
                var $input = $link.parent().parent().find("input");
                var product_elem = $('.product_content[data-line-id="'+$input.attr("name")+'"]')
                if(!product_elem.hasClass('select_item')){
                    product_elem.addClass('select_item')
                }
                var min = parseFloat($input.data("min") || 0);
                var max = parseFloat($input.data("max") || $input.val());
                var total_qty = parseFloat($input.data("total-qty") || 0);
                var quantity = ($link.has(".fa-minus").length ? -1 : 1) + parseFloat($input.val(),10);
                $input.val(quantity > min ? (quantity < max ? quantity : max) : min);
                $input.change();
                return false;
            };
            this.keypress_order_number = function(e){
                if(e.which === 13){
                    var selectedOrder = self.pos.get_order();
                    var ret_o_ref = $("input#return_order_number").val();
                    if (ret_o_ref.indexOf('Order') == -1) {
                        var ret_o_ref_order = _t('Order ') + ret_o_ref.toString();
                    }
                    if (ret_o_ref.length > 0) {
                        var params = {
                            model: 'pos.order',
                            method: 'search_read',
                            domain: [['pos_reference', '=', ret_o_ref_order]],
                            fields: [],
                        }
                        return rpc.query(params, {async: false}).then(function(result){
                            if (result && result.length > 0) {
                                if(result[0].state == 'draft' || result[0].state == 'cancel'){
                                    return self.pos.db.notification('danger',_t('Sorry, You can not return unpaid/cancel order'));
                                }
                                selectedOrder.set_ret_o_id(result[0].id);
                                selectedOrder.set_ret_o_ref(result[0].pos_reference);
                                if(result[0].partner_id && result[0].partner_id[0]){
                                    var partner = self.pos.db.get_partner_by_id(result[0].partner_id[0])
                                    selectedOrder.set_client(partner);
                                } else{
                                    selectedOrder.set_client(false);
                                }
                                var orderline_params = {
                                    model: 'pos.order.line',
                                    method: 'load_return_order_lines',
                                    args: [result[0].id],
//                	            	domain: [['order_id', '=', result[0].id],['return_qty', '>', 0]],
                                }
                                return rpc.query(orderline_params, {async: false}).then(function(res){
                                    if(res && res.length > 0){
                                        var lines = [];
                                        _.each(res,function(r) {
                                            var prod = self.pos.db.get_product_by_id(r.product_id[0]);
//	                                    	if(prod && selectedOrder.is_sale_product(prod)){
                                            if(prod && !prod.is_dummy_product){
                                                lines.push(r);
                                                self.line[r.id] = r;
                                            }
                                        });
                                        self.lines = lines;
                                        self.renderElement();
                                    } else {
                                        self.pos.db.notification('danger',_t('No item found'));
                                        $('.ac_product_list').empty();
                                    }
                                }).fail(function(){
                                    self.pos.db.notification('danger',"Connection lost");
                                });
                            } else {
                                self.pos.db.notification('danger',_t('No result found'));
                                $('.ac_product_list').empty();
                            }
                        }).fail(function(){
                            self.pos.db.notification('danger',"Connection lost");
                        });
                    }
                }
            };
            this.keydown_qty = function(e){
                if($(this).val() > $(this).data('max')){
                    $(this).val($(this).data('max'))
                }
                if($(this).val() < $(this).data('min')){
                    $(this).val($(this).data('min'))
                }
            };
        },
        selected_item: function($elem){
            var self = this;
            if($elem.hasClass('select_item')){
                $elem.removeClass('select_item')
            } else {
                $elem.addClass('select_item')
            }
        },
        show: function(options){
            var self = this;
            options = options || {};
            this._super(options);
            $("input#return_order_number").focus();
            $('.ac_product_list').empty();
        },
        click_confirm: function(){
            var self = this;
            var selectedOrder = this.pos.get_order();
            var to_be_return = [];
            if(selectedOrder.get_ret_o_id()){
                var not_allow = true;
                if($('.select_item').length > 0){
                    selectedOrder.empty_cart()
                    _.each($('.select_item'), function(item){
                        var orderline = self.line[$(item).data('line-id')];
                        var input_val = $(item).find('input.return_product_qty[name='+orderline.id+']').val()
                        if(input_val > 0 && input_val <= orderline.return_qty){
                            not_allow = false;
                            var product = self.pos.db.get_product_by_id(orderline.product_id[0]);
                            var line = new models.Orderline({}, {pos: self.pos, order: selectedOrder, product: product});
                            line.set_quantity($('input[name="'+orderline.id+'"').val() * -1);
                            line.set_unit_price(orderline.price_unit);
                            line.set_oid(orderline.order_id);
                            line.state = 'done';
                            if(orderline.discount){
                                line.set_discount(orderline.discount)
                            }
                            line.set_back_order(selectedOrder.get_ret_o_ref());
                            to_be_return.push(line);
                        }
                    });
                    if(to_be_return && to_be_return.length > 0){
                        self.pos.gui.show_popup('return_details_popup',{'lines':to_be_return});
                    }
                    if(not_allow){
                        return
                    }
                    $('#return_order_ref').html(selectedOrder.get_ret_o_ref());
                    this.gui.close_popup();
                    if(to_be_return && to_be_return.length > 0){
                        self.pos.gui.show_popup('return_details_popup',{'lines':to_be_return});
                    }
                }
            }else{
                $("input#return_order_number").focus();
            }
        },
        click_cancel: function(){
            $("div#sale_mode").trigger('click');
            var selectedOrder = this.pos.get_order();
            selectedOrder.set_ret_o_id(null);
            selectedOrder.set_ret_o_ref(null);
            this.gui.close_popup();
        },
        get_product_image_url: function(product_id){
            return window.location.origin + '/web/binary/image?model=product.product&field=image_medium&id='+product_id;
        },
        renderElement: function(){
            this._super();
            this.$('.return_product .input-group-addon').delegate('a.js_return_qty','click', this.update_return_product_qty);
            this.$('div.content').delegate('#return_order_number','keypress', this.keypress_order_number);
            this.$('div.input-group').delegate('.js_quantity','input', this.keydown_qty);
            this.$('.ac_product_list').delegate('.product-img','click', this.select_item);
        }
    });
    gui.define_popup({name:'pos_return_order', widget: PosReturnOrder});

    var POSSessionConfig = PopupWidget.extend({
        template: 'POSSessionConfig',
        show: function(options){
            options = options || {};
            this._super(options);
            this.renderElement();
        },
        renderElement: function() {
            var self = this;
            this._super();
//            $('.close-pos').click(function(){
//            	self.gui.close_popup();
//    	    	self.gui.close();
//            });
            $('.logout-pos').click(function(){
                framework.redirect('/web/session/logout');
            });
            $('.close-popup-btn').click(function(){
                self.gui.close_popup();
            });
            $('.close-pos-session').click(function(){
                if(self.pos.config.cash_control){
                    self.gui.show_popup('cash_control',{
                        title:'Declaración de Efectivo',
                        statement_id:self.statement_id,
                    });
                }else{
                    var cashier = self.pos.get_cashier() || false;
                    if(!cashier){
                        cashier = self.pos.user;
                    }
                    if(cashier.login_with_pos_screen){
                        var params = {
                            model: 'pos.session',
                            method: 'custom_close_pos_session',
                            args:[self.pos.pos_session.id]
                        }
                        rpc.query(params, {async: false}).then(function(res){
                            if(res){
                                if(cashier.login_with_pos_screen){
                                    framework.redirect('/web/session/logout');
                                }
                            }
                        });
                    }else{
                        self.gui.close();
                    }
                }
            });
        },
    });
    gui.define_popup({name:'POS_session_config', widget: POSSessionConfig});

    var BagSelectionPopupWidget = PopupWidget.extend({
        template: 'BagSelectionPopupWidget',
        events: _.extend({}, PopupWidget.prototype.events, {
            'keypress .js_quantity.form-control':  'keypress_qty',
        }),
        init: function(parent, args) {
            var self = this;
            this._super(parent, args);
            this.options = {};
            this.select_item = function(e){
                self.selected_item($(this).parent());
            };
            this.update_bag_qty = function(ev){
                ev.preventDefault();
                var $link = $(ev.currentTarget);
                var $input = $link.parent().parent().find("input");
                var product_elem = $('.product_content[data-product-id="'+$input.attr("prod-id")+'"]')
                if(!product_elem.hasClass('select_item')){
                    self.selected_item(product_elem);
                    product_elem.addClass('select_item');
                }
                var min = parseFloat($input.data("min") || 0);
                var max = parseFloat($input.data("max") || $input.val());
                var total_qty = parseFloat($input.data("total-qty") || 0);
                var quantity = ($link.has(".fa-minus").length ? -1 : 1) + parseFloat($input.val(),10);
                $input.val(quantity > min ? (quantity < max ? quantity : max) : min);
                $input.change();
                self.count_bag_total();
                return false;
            };
            this.keydown_qty = function(e){
                var opp_elem;
                var product_elem = $('.product_content[data-line-id="'+$(e.currentTarget).attr("name")+'"]')
                if(!product_elem.hasClass('select_item')){
                    product_elem.addClass('select_item')
                }
                self.count_bag_total();
            };
        },
        keypress_qty: function(e){
            if (e.which != 8 && e.which != 0 && (e.which < 48 || e.which > 57)) {
                return false;
             }
        },
        selected_item: function($elem){
            var self = this;
            if($elem.hasClass('select_item')){
                $elem.removeClass('select_item')
            } else {
                $elem.addClass('select_item')
            }
            if($('.select_item').length != 0){
                $('#sub_container').show();
                $('#chk_bag_charges').prop('checked', true);
            } else {
                $('#chk_bag_charges').prop('checked', false);
                $('#sub_container').hide();
            }
            self.count_bag_total();
        },
        show: function(options){
            options = options || {};
            this._super(options);
            $('#sub_container').hide();
            $('#bag_charges_total').html("Total: "+this.format_currency(0));
        },
        click_confirm: function(){
            var self = this;
            var order = self.pos.get_order();
            $('.select_item').each(function(index,el){
                var product = self.pos.db.get_product_by_id($(this).attr('data-product-id'));
                if(product){
                    var input_qty = $("#"+product.id).val();
                    if(input_qty > 0){
                        var line = new models.Orderline({}, {pos: self.pos, order: order, product: product});
                        line.set_quantity(input_qty);
                        line.set_unit_price(0);
                        if($('#chk_bag_charges').prop('checked')){
                            line.set_unit_price(product.list_price);
                        }
                        line.set_bag_color(true);
                        line.set_is_bag(true);
                        line.state = 'done';
                        order.add_orderline(line);
                        order.mirror_image_data();
                    }
                }
            });
            if($('.select_item').length != 0){
                self.gui.close_popup();
            }
        },
        renderElement: function() {
            var self = this;
            this._super();
            this.$('.bag_product .input-group-addon').delegate('a.js_qty','click', this.update_bag_qty);
            this.$('div.input-group').delegate('.js_quantity','input', this.keydown_qty);
            this.$('.ac_product_list').delegate('.product-img','click', this.select_item);

            $('#chk_bag_charges').change(function(){
                self.count_bag_total();
            });
        },
        count_bag_total: function(){
            var self = this;
            var total = 0;
            if($('#chk_bag_charges').prop('checked')){
                $('table.total .bag_value').text("");
                $('.select_item').each(function(index,el){
                    var prod = self.pos.db.get_product_by_id($(this).attr('data-product-id'));
                    if(prod){
                        self.input_qty = $("#"+prod.id).val();
                        if(self.input_qty && prod.list_price){
                            total += self.input_qty*prod.list_price;
                        }
                    }
                });
            }
            $('#bag_charges_total').html("Total: "+self.format_currency(total));
        },
        get_product_image_url: function(product_id){
            return window.location.origin + '/web/image?model=product.product&field=image_medium&id='+product_id;
        },
    });
    gui.define_popup({name:'bags_popup', widget: BagSelectionPopupWidget});

    var ComformDeliveryPopupWidget = PopupWidget.extend({
        template: 'ComformDeliveryPopupWidget',
        show: function(options){
            options = options || {};
            this._super(options);
            this.renderElement();
        },
        click_confirm: function(){
            var order = this.pos.get_order();
            var lines = order.get_orderlines();
            var list = []
            for(var i=0;i<lines.length;i++){
                lines[i].set_deliver_info(false);
                if(lines[i].get_delivery_charges_flag()){
                    list.push(lines[i]);
                }
            }
            for(var j=0;j<list.length;j++){
                order.remove_orderline(list[j]);
                order.set_is_delivery(false);
            }
            $('#delivery_mode').removeClass('deliver_on');
            this.gui.close_popup();
            self.pos.chrome.screens.payment.render_paymentlines();
        },
        renderElement: function() {
            var self = this;
            this._super();
            this.$('.cancel').click(function(){
                self.gui.close_popup();
//	    		self.gui.show_screen('products');
            });
        },
    });
    gui.define_popup({name:'conf_delivery', widget: ComformDeliveryPopupWidget});

    var RedeemLoyaltyPointsPopup = PopupWidget.extend({
        template: 'RedeemLoyaltyPointsPopup',
        show: function(options){
            var self = this;
            this.payment_self = options.payment_self;
            this._super(options);
            var order = self.pos.get_order();
            var fields = self.pos.partner_fields;
            var params = {
                model: 'res.partner',
                method: 'search_read',
                domain: [['id', '=', order.get_client().id]],
                fields: fields,
            }
            rpc.query(params, {async: false})
            .then(function(partner){
                if(partner.length > 0){
                    var exist_partner = self.pos.db.get_partner_by_id(order.get_client().id);
                    _.extend(exist_partner, partner[0]);
                }
            }).fail(function(){
                self.pos.db.notification('danger',"Connection lost");
            });
            $('body').off('keypress', this.payment_self.keyboard_handler);
            $('body').off('keydown',this.payment_self.keyboard_keydown_handler);
            window.document.body.removeEventListener('keypress',this.payment_self.keyboard_handler);
            window.document.body.removeEventListener('keydown',this.payment_self.keyboard_keydown_handler);
            self.renderElement();
            $('.redeem_loyalty_input').focus();
        },
        click_confirm: function(){
            var self =this;
            var order = this.pos.get_order();
            var redeem_point_input = $('.redeem_loyalty_input');
            if(redeem_point_input.val() && $.isNumeric(redeem_point_input.val())
                    && Number(redeem_point_input.val()) > 0){
                var remaining_loyalty_points = order.get_client().remaining_loyalty_points - order.get_loyalty_redeemed_point();
                if(Number(redeem_point_input.val()) <= remaining_loyalty_points){
                    var amount_to_redeem = (Number(redeem_point_input.val()) * self.pos.loyalty_config.to_amount) / self.pos.loyalty_config.points;
                    if(amount_to_redeem <= (order.get_due() || order.get_total_with_tax())){
                        if(self.pos.config.loyalty_journal_id){
                            var loyalty_cashregister = _.find(self.pos.cashregisters, function(cashregister){
                                return cashregister.journal_id[0] === self.pos.config.loyalty_journal_id[0] ? cashregister : false;
                            });
                            if(loyalty_cashregister){
                                order.add_paymentline(loyalty_cashregister);
                                order.selected_paymentline.set_amount(amount_to_redeem);
                                order.selected_paymentline.set_loyalty_point(Number(redeem_point_input.val()));
                                order.selected_paymentline.set_freeze_line(true);
                                self.payment_self.reset_input();
                                self.payment_self.render_paymentlines();
                                order.set_loyalty_redeemed_point(Number(order.get_loyalty_redeemed_point()) + Number(redeem_point_input.val()));
                                order.set_loyalty_redeemed_amount(order.get_loyalty_amount_by_point(order.get_loyalty_redeemed_point()));
                                this.gui.close_popup();
                            }
                        } else {
                            self.pos.db.notification('danger',_t("Please configure Journal for Loyalty in Point of sale configuration."));
                        }
                    }
                }
            }
        },
        renderElement: function(){
            var self = this;
            this._super();
            var order = self.pos.get_order();
            if(self.el.querySelector('.redeem_loyalty_input')){
                self.el.querySelector('.redeem_loyalty_input').addEventListener('keyup', function(e){
                    if($.isNumeric($(this).val())){
                        var val = this.value;
                        var re = /^([0-9]+[\.]?[0-9]?[0-9]?|[0-9]+)$/g;
                        var re1 = /^([0-9]+[\.]?[0-9]?[0-9]?|[0-9]+)/g;
                        if (re.test(val)) {
                            //do something here
                        } else {
                            val = re1.exec(val);
                            if (val) {
                                this.value = val[0];
                            } else {
                                this.value = "";
                            }
                        }
                        var remaining_loyalty_points = order.get_client().remaining_loyalty_points - order.get_loyalty_redeemed_point();
                        var amount = order.get_loyalty_amount_by_point(Number($(this).val()));
                        $('.point_to_amount').text(self.format_currency(amount));
                        if(Number($(this).val()) > remaining_loyalty_points){
                            self.pos.db.notification('danger',_t('Can not redeem more than your remaining points.'));
                            $(this).val(0);
                            $('.point_to_amount').text('0.00');
                        }
                        if(amount > (order.get_due() || order.get_total_with_tax())){
                            self.pos.db.notification('danger',_t('Loyalty Amount exceeding Due Amount.'));
                            $(this).val(0);
                            $('.point_to_amount').text('0.00');
                        }
                    } else {
                        $('.point_to_amount').text('0.00');
                    }
                });
            }
        },
        close: function(){
            $('body').off('keypress', this.payment_self.keyboard_handler).keypress(this.payment_self.keyboard_handler);
            $('body').off('keypress', this.payment_self.keyboard_keydown_handler).keydown(this.payment_self.keyboard_keydown_handler);
        },
    });
    gui.define_popup({name:'redeem_loyalty_points', widget: RedeemLoyaltyPointsPopup});

    var TodayPosReportPopup = PopupWidget.extend({
        template: 'TodayPosReportPopup',
        show: function(options){
            this.str_main = options.str_main || "";
            this.str_payment = options.str_payment || "";
            options = options || {};
            this._super(options);
            this.session_total = options.result['session_total'] || [];
            this.payment_lst = options.result['payment_lst'] || [];
            this.all_cat = options.result['all_cat'] || [];
            this.renderElement();
            $(".tabs-menu a").click(function(event) {
                event.preventDefault();
                $(this).parent().addClass("current");
                $(this).parent().siblings().removeClass("current");
                var tab = $(this).attr("href");
                $(".tab-content").not(tab).css("display", "none");
                $(tab).fadeIn();
            });
        },
        renderElement: function() {
            var self = this;
            this._super();
        },
    });
    gui.define_popup({name:'pos_today_sale', widget: TodayPosReportPopup});

    var PutMoneyInPopup = PopupWidget.extend({
        template: 'PutMoneyInPopup',
        show: function(options){
            this.msg_show_put_money_in = options.msg_show_put_money_in || "";
            options = options || {};
            this._super(options);
            this.renderElement();
            if(self.pos.config.money_in_reason){
                $('#txt_reason_in_id').val(self.pos.config.money_in_reason);
                $('#txt_amount_in_id').focus();
            } else{
                $('#txt_reason_in_id').focus();
            }
            $('#txt_amount_in_id').keypress(function(event) {
                if(event.which == 8 || event.keyCode == 37 || event.keyCode == 39 || event.keyCode == 46)
                     return true;
                else if((event.which != 46 || $(this).val().indexOf('.') != -1) && (event.which < 48 || event.which > 57))
                     event.preventDefault();
            });
        },
        click_confirm: function(){
            var self = this;
            var name = '';
            var amount ='';
            name = $('#txt_reason_in_id').val();
            amount = Number($('#txt_amount_in_id').val());
            var session_id = self.pos.pos_session.id;
            if(!name || !amount){
                this.$('#txt_reason_in_id').focus();
                return self.pos.db.notification('danger',_t("Please Fill All Fields."));
            }
            var params = {
                model: 'pos.session',
                method: 'put_money_in',
                args: [name,amount,session_id],
            }
            rpc.query(params, {async: false}).then(function(result){
                if (result['error']) {
                    self.pos.db.notification('danger',result['error']);
                }else{
                    var order = self.pos.get_order();
                    if(order && self.pos.config.money_in_out_receipt){
                        order.set_money_inout_details({
                            'operation': "Put Money In",
                            'reason': name,
                            'amount': amount,
                        });
                    }
                    if (self.pos.config.iface_cashdrawer) {
                        self.pos.proxy.open_cashbox();
                    }
                    self.pos.db.notification('success',_t('Transaction successful.'));
                    self.gui.close_popup();
                    if(self.pos.config.money_in_out_receipt){
                        var order = self.pos.get_order();
                        if(self.pos.config.iface_print_via_proxy){
                            var receipt = "";
                            receipt = QWeb.render('XmlMoneyInOutTicket', {
                                widget: self,
                                pos: self.pos,
                                order: order,
                            });
                            self.pos.proxy.print_receipt(receipt);
                        }else{
                            self.gui.show_screen('receipt');
                        }
                    }
                }
            }).fail(function(error, event) {
                if (error.code === -32098) {
                    self.pos.db.notification('danger',_t('Please check your internet connection.'));
                    event.preventDefault();
                }
            });
        },
    });
    gui.define_popup({name:'put_money_in', widget: PutMoneyInPopup});

    var TakeMoneyOutPopup = PopupWidget.extend({
        template: 'TakeMoneyOutPopup',
        show: function(options){
            this.msg_show_take_money_out = options.msg_show_take_money_out || "";
            options = options || {};
            this._super(options);
            this.renderElement();
            if(self.pos.config.money_out_reason){
                $('#txt_reason_out_id').val(self.pos.config.money_out_reason)
                $('#txt_amount_out_id').focus();
            } else{
                $('#txt_reason_out_id').focus();
            }
            $('#txt_amount_out_id').keypress(function(event) {
                if(event.which == 8 || event.keyCode == 37 || event.keyCode == 39 || event.keyCode == 46)
                     return true;
                else if((event.which != 46 || $(this).val().indexOf('.') != -1) && (event.which < 48 || event.which > 57))
                     event.preventDefault();
            });
        },
        click_confirm: function(){
            var self = this;
            var name = '';
            var amount ='';
            name = $('#txt_reason_out_id').val();
            amount = Number($('#txt_amount_out_id').val());
            var session_id = self.pos.pos_session.id;
            if(!name || !amount){
                this.$('#txt_reason_out_id').focus();
                return self.pos.db.notification('danger',_t("Please Fill All Fields."));
            }
            if(self.pos.config.amount_limit != 0){
                if(amount > self.pos.config.amount_limit){
                    return self.pos.db.notification('danger',_t("Transaction Failed"));
                }
            }
            var params = {
                model: 'pos.session',
                method: 'take_money_out',
                args: [name,amount,session_id],
            }
            rpc.query(params, {async: false}).then(function(result){
                if (result['error']) {
                    self.pos.db.notification('danger',result['error']);
                }else {
                    var order = self.pos.get_order();
                    if(order && self.pos.config.money_in_out_receipt){
                        order.set_money_inout_details({
                            'operation': "Take Money Out",
                            'reason': name,
                            'amount': amount,
                        });
                    }
                    if (self.pos.config.iface_cashdrawer) {
                        self.pos.proxy.open_cashbox();
                    }
                    self.pos.db.notification('success',_t('Transaction successful.'));
                    self.gui.close_popup();
                    if(self.pos.config.money_in_out_receipt){
                        var order = self.pos.get_order();
                        if(self.pos.config.iface_print_via_proxy){
                            var receipt = "";
                            receipt = QWeb.render('XmlMoneyInOutTicket', {
                                widget: self,
                                pos: self.pos,
                                order: order,
                            });
                            self.pos.proxy.print_receipt(receipt);
                        }else{
                            self.gui.show_screen('receipt');
                        }
                    }
                }
            }).fail(function(error, event) {
                if (error.code === -32098) {
                    self.pos.db.notification('danger',_t('Please check your internet connection.'));
                    event.preventDefault();
                }
            });
        },
    });
    gui.define_popup({name:'take_money_out', widget: TakeMoneyOutPopup});

    var CreateCardPopupWidget = PopupWidget.extend({
        template: 'CreateCardPopupWidget',

        show: function(options){
            var self = this;
            this._super(options);
            self.partner_id = '';
            options = options || {};
            self.panding_card = options.card_data || false;
            this.renderElement();
            $('#card_no').focus();
            var timestamp = new Date().getTime()/1000;
            var partners = this.pos.db.all_partners;
            var partners_list = [];
            if(self.pos.config.default_exp_date && !self.panding_card){
                var date = new Date();
                date.setMonth(date.getMonth() + self.pos.config.default_exp_date);
                var new_date = date.getFullYear()+ "/" +(date.getMonth() + 1)+ "/" +date.getDate();
                self.$('#text_expire_date').val(new_date);
            }
//            if(partners && partners[0]){
//            	partners.map(function(partner){
//            		partners_list.push({
//            			'id':partner.id,
//            			'value':partner.name,
//            			'label':partner.name,
//            		});
//            	});
//            	$('#select_customer').keypress(function(e){
//	            	$('#select_customer').autocomplete({
//	                    source:partners_list,
//	                    select: function(event, ui) {
//	                    	self.partner_id = ui.item.id;
//	                    },
//	                });
//            	});
//            	if(self.panding_card){
//            		self.partner_id = self.panding_card.giftcard_customer;
//            		$('#checkbox_paid').prop('checked',true);
//            	}
//            }
            $("#text_amount").keypress(function (e) {
                if (e.which != 8 && e.which != 0 && (e.which < 48 || e.which > 57) && e.which != 46) {
                    return false;
               }
            });
            $('#select_customer').autocomplete({
                source: function(request, response) {
                    var query = request.term;
                    var search_timeout = null;
                    if(query){
                        search_timeout = setTimeout(function(){
                            var partners_list = [];
                            var clients = self.pos.db.search_partner(query);
                            _.each(clients, function(partner){
                               partners_list.push({
                                   'id':partner.id,
                                   'value':partner.name,
                                   'label':partner.name
                               });
                            });
                            response(partners_list);
                        },70);
                    }
                },
                select: function(event, partner) {
                    event.stopImmediatePropagation();
                    // event.preventDefault();
                    if (partner.item && partner.item.id) {
                        self.partner_id =  partner.item.id;
                        var partner_obj = _.find(self.partners, function(customer) {
                            return customer.id == partner.item.id;
                        });
                        if (partner_obj) {
                            self.set_customer(partner_obj);
                        }
                    }
                },
                focus: function(event, ui) {
                    event.preventDefault(); // Prevent the default focus behavior.
                },
                close: function(event) {
                    // it is necessary to prevent ESC key from propagating to field
                    // root, to prevent unwanted discard operations.
                    if (event.which === $.ui.keyCode.ESCAPE) {
                        event.stopPropagation();
                    }
                },
                autoFocus: true,
                html: true,
                minLength: 1,
                delay: 200
            });
            if(self.pos.config.manual_card_number && !self.panding_card){
                $('#card_no').removeAttr("readonly");
                $("#card_no").keypress(function (e) {
                    if (e.which != 8 && e.which != 0 && (e.which < 48 || e.which > 57) && e.which != 46) {
                        return false;
                   }
                });
            } else if(!self.panding_card){
                $('#card_no').val(window.parseInt(timestamp));
                $('#card_no').attr("readonly", "readonly");
            }
            var partner = null;
            for ( var j = 0; j < self.pos.partners.length; j++ ) {
                partner = self.pos.partners[j];
                self.partner=this.partner
            }
        },

        click_confirm: function(){
            var self = this;
            var move = true;
            var order = self.pos.get_order();
            var checkbox_paid = document.getElementById("checkbox_paid");
            var expire_date = this.$('#text_expire_date').val();
            var select_customer = self.partner_id;
            var select_card_type = $('#select_card_type').val();
            var card_number = $('#card_no').val();
            if(!card_number){
                self.pos.db.notification('danger',_t('Please enter gift card number.'));
                return;
            } else{
                var params = {
                        model: 'aspl.gift.card',
                        method: 'search_read',
                        domain: [['card_no', '=', $('#card_no').val()]],
                    }
                rpc.query(params, {async: false}).then(function(gift_count){
                    gift_count = gift_count.length;
                    if(gift_count > 0){
                        $('#card_no').css('border', 'thin solid red');
                        move = false;
                    } else{
                        $('#card_no').css('border', '0px');
                    }
                }).fail(function(){
                    self.pos.db.notification('danger',"Connection lost");
                });
            }
            if(!move){
                self.pos.db.notification('danger',_t('Card already exist.'));
                return
            }
            if(self.partner_id){
                var client = self.pos.db.get_partner_by_id(self.partner_id);
            }
            if(expire_date){
                if(checkbox_paid.checked){
                    $('#text_amount').focus();
                    var input_amount =this.$('#text_amount').val();
                    if(input_amount){
                        order.set_client(client);
                        var product = self.pos.db.get_product_by_id(self.pos.config.gift_card_product_id[0]);
                        if (self.pos.config.gift_card_product_id[0]){
                            order.empty_cart()
                            var line = new models.Orderline({}, {pos: self.pos, order: order, product: product});
                            line.set_unit_price(input_amount);
                            order.add_orderline(line);
                            order.select_orderline(order.get_last_orderline());
                        }
                        var gift_order = {'giftcard_card_no': $('#card_no').val(),
                            'giftcard_customer': select_customer ? select_customer : false,
                            'giftcard_expire_date': $('#text_expire_date').val(),
                            'giftcard_amount': $('#text_amount').val(),
                            'giftcard_customer_name': $("#select_customer").val(),
                            'card_type': $('#select_card_type').val(),
                        }
                        if(self.pos.config.msg_before_card_pay) {
                            self.gui.show_popup('confirmation_card_payment',{'card_data':gift_order});
                        } else{
                            order.set_giftcard(gift_order);
                            self.gui.show_screen('payment');
                            $("#card_back").hide();
                            $( "div.js_set_customer" ).off("click");
                            $( "div#card_invoice" ).off("click");
                            this.gui.close_popup(); 
                        }
                    }else{
                        self.pos.db.notification('danger',_t('Please enter card value.'));
                        $('#text_amount').focus();
                    }
                }else{
                    var input_amount =this.$('#text_amount').val();
                    if(input_amount){
                        order.set_client(self.pos.db.get_partner_by_id(self.partner_id));
                        order.set_free_data({
                            'giftcard_card_no': $('#card_no').val(),
                            'giftcard_customer': select_customer ? select_customer : false,
                            'giftcard_expire_date': $('#text_expire_date').val(),
                            'giftcard_amount': $('#text_amount').val(),
                            'giftcard_customer_name': $("#select_customer").val(),
                            'card_type': $('#select_card_type').val(),
                        })
                        var params = {
                            model: "aspl.gift.card",
                            method: "create",
                            args: [{
                                'card_no': Number($('#card_no').val()),
                                'card_value':  Number($('#text_amount').val()),
                                'customer_id':self.partner_id ? Number(self.partner_id) : false,
                                'expire_date':$('#text_expire_date').val(),
                                'card_type': Number($('#select_card_type').val()),
                            }]
                        }
                        rpc.query(params, {async: false}).fail(function(){
                            self.pos.db.notification('danger',"Connection lost");
                        });
//                    	new Model("aspl.gift.card").get_func("create")({
//                    		'card_no': Number($('#card_no').val()),
//                    		'card_value':  Number($('#text_amount').val()),
//                    		'customer_id':self.partner_id ? Number(self.partner_id) : false,
//                    		'expire_date':$('#text_expire_date').val(),
//                    		'card_type': Number($('#select_card_type').val()),
//                    	});
                        self.gui.show_screen('receipt');
                        this.gui.close_popup();
                    }else{
                        self.pos.db.notification('danger',_t('Please enter card value.'));
                        $('#text_amount').focus();
                    }
                }
            }else{
                self.pos.db.notification('danger',_t('Please select expire date.'));
                $('#text_expire_date').focus();
            }
            
        },

        renderElement: function() {
            var self = this;
            this._super();
            $('#text_expire_date').datepicker({
                minDate: 0,
                dateFormat:'yy/mm/dd',
            });
        },
    });
    gui.define_popup({name:'create_card_popup', widget: CreateCardPopupWidget});

    var RedeemCardPopupWidget = PopupWidget.extend({
        template: 'RedeemCardPopupWidget',

        show: function(options){
           self = this;
           this.payment_self = options.payment_self || false;
           this._super();
           self.redeem = false;
           var order = self.pos.get_order();
           $('body').off('keypress', self.payment_self.keyboard_handler);
           $('body').off('keydown', self.payment_self.keyboard_keydown_handler);
           window.document.body.removeEventListener('keypress',self.payment_self.keyboard_handler);
           window.document.body.removeEventListener('keydown',self.payment_self.keyboard_keydown_handler);
           this.renderElement();
           $("#text_redeem_amount").keypress(function (e) {
               if(e.which != 8 && e.which != 0 && (e.which < 48 || e.which > 57) && e.which != 46) {
                    return false;
               }
           });
//           $('body').off('keypress', this.payment_self.keyboard_handler);
//       	   $('body').off('keydown',this.payment_self.keyboard_keydown_handler);
//           window.document.body.removeEventListener('keypress',self.payment_self.keyboard_handler);
//           window.document.body.removeEventListener('keydown',self.payment_self.keyboard_keydown_handler);
//           this.renderElement();
//           $('body').off('keypress', this.payment_self.keyboard_handler);
//           $('body').off('keydown',this.payment_self.keyboard_keydown_handler);
//           this.$('#text_gift_card_no').focus(function() {
//        	   $('body').off('keypress', self.payment_self.keyboard_handler);
//	           $('body').off('keydown',self.payment_self.keyboard_keydown_handler);
//	       });
//	       this.$("#text_gift_card_no").focusout(function() {
//	    	   $('body').off('keypress', self.payment_self.keyboard_handler).keypress(self.payment_self.keyboard_handler);
//	           $('body').off('keydown', self.payment_self.keyboard_keydown_handler).keydown(self.payment_self.keyboard_keydown_handler);
//	       });
//           this.$('#text_redeem_amount').focus(function() {
//        	   $('body').off('keypress', self.payment_self.keyboard_handler);
//	           $('body').off('keydown',self.payment_self.keyboard_keydown_handler);
//	       });
//	       this.$("#text_redeem_amount").focusout(function() {
//	    	   $('body').off('keypress', self.payment_self.keyboard_handler).keypress(self.payment_self.keyboard_handler);
//	           $('body').off('keydown', self.payment_self.keyboard_keydown_handler).keydown(self.payment_self.keyboard_keydown_handler);
//	       });
           /*$("#text_redeem_amount").keypress(function (e) {
               if(e.which != 8 && e.which != 0 && (e.which < 48 || e.which > 57) && e.which != 46) {
                    return false;
               }
            });*/
           $('#text_gift_card_no').focus();
           $('#redeem_amount_row').hide();
           $('#text_gift_card_no').keypress(function(e) {
               if (e.which == 13 && $(this).val()) {
                    var today = moment().locale('en').format('YYYY-MM-DD');
                    var code = $(this).val();
                    var get_redeems = order.get_redeem_giftcard();
                    var existing_card = _.where(get_redeems, {'redeem_card': code });
                    var params = {
                        model: 'aspl.gift.card',
                        method: 'search_read',
                        domain: [['card_no', '=', code], ['expire_date', '>=', today], ['issue_date', '<=', today]],
                    }
                    rpc.query(params, {async: false})
//                    new Model('aspl.gift.card').get_func('search_read')([['card_no', '=', code], ['expire_date', '>=', today]])
                    .then(function(res){
                        if(res.length > 0){
                            if (res[0]){
                                if(existing_card.length > 0){
                                    res[0]['card_value'] = existing_card[existing_card.length - 1]['redeem_remaining']
                                }
                                self.redeem = res[0];
                                $('#lbl_card_no').html("Your Balance is  "+ self.format_currency(res[0].card_value));
                                if(res[0].customer_id[1]){
                                    $('#lbl_set_customer').html("Hello  "+ res[0].customer_id[1]);
                                } else{
                                    $('#lbl_set_customer').html("Hello  ");
                                }
                                $('#text_redeem_amount').show();
                                if(res[0].card_value <= 0){
                                    $('#redeem_amount_row').hide();
                                    $('#in_balance').show();
                                }else{
                                    $('#redeem_amount_row').fadeIn('fast');
                                    $('#text_redeem_amount').focus();
                                }
                            }
                        }else{
                            self.pos.db.notification('danger',_t('Barcode not found or gift card has been expired.'));
                            $('#text_gift_card_no').focus();
                            $('#lbl_card_no').html('');
                            $('#lbl_set_customer').html('');
                            $('#in_balance').html('');
                            $('#text_redeem_amount').hide();
                        }
                    });
                }
            });
        },
  
//        click_cancel: function(){
//            var self = this;
//            self._super();
//            $('body').keypress(this.payment_self.keyboard_handler);
//	        $('body').keydown(this.payment_self.keyboard_keydown_handler);
//            window.document.body.addEventListener('keypress',self.payment_self.keyboard_handler);
//            window.document.body.addEventListener('keydown',self.payment_self.keyboard_keydown_handler);
//        },

        click_confirm: function(){
            var self = this;
            var order = self.pos.get_order();
            var client = order.get_client();
            var redeem_amount = this.$('#text_redeem_amount').val();
            var code = $('#text_gift_card_no').val();
            if(self.redeem.card_no){
                if(code == self.redeem.card_no){
                    if(!self.redeem.card_value == 0){
                        if(redeem_amount){
                            if (redeem_amount <= (order.get_due() || order.get_total_with_tax())){
                                if(!client){
                                    order.set_client(self.pos.db.get_partner_by_id(self.redeem.customer_id[0]));
                                }
                                if( 0 < Number(redeem_amount)){
                                    if(self.redeem && self.redeem.card_value >= Number(redeem_amount) ){
                                        if(self.redeem.customer_id[0]){
                                            var vals = {
                                                'redeem_card_no':self.redeem.id,
                                                'redeem_card':$('#text_gift_card_no').val(),
                                                'redeem_card_amount':$('#text_redeem_amount').val(),
                                                'redeem_remaining':self.redeem.card_value - $('#text_redeem_amount').val(),
                                                'card_customer_id': client ? client.id : self.redeem.customer_id[0],
                                                'customer_name': client ? client.name : self.redeem.customer_id[1],
                                            };
                                        } else {
                                            var vals = {
                                                'redeem_card_no':self.redeem.id,
                                                'redeem_card':$('#text_gift_card_no').val(),
                                                'redeem_card_amount':$('#text_redeem_amount').val(),
                                                'redeem_remaining':self.redeem.card_value - $('#text_redeem_amount').val(),
                                                'card_customer_id': order.get_client() ? order.get_client().id : false,
                                                'customer_name': order.get_client() ? order.get_client().name : '',
                                            };
                                        }

                                        var get_redeem = order.get_redeem_giftcard();
                                        if(get_redeem){
                                            var product = self.pos.db.get_product_by_id(self.pos.config.enable_journal_id)
                                            if(self.pos.config.enable_journal_id[0]){
                                               var cashregisters = null;
                                               for ( var j = 0; j < self.pos.cashregisters.length; j++ ) {
                                                    if(self.pos.cashregisters[j].journal_id[0] === self.pos.config.enable_journal_id[0]){
                                                        cashregisters = self.pos.cashregisters[j];
                                                    }
                                                }
                                            }
                                            if (vals){
                                                $('body').off('keypress', self.keyboard_handler).keypress(self.payment_self.keyboard_handler);
                                                $('body').off('keydown',self.keyboard_keydown_handler).keydown(self.payment_self.keyboard_keydown_handler);
//                                            	$('body').keypress(self.payment_self.keyboard_handler);
//                                    	        $('body').keydown(self.payment_self.keyboard_keydown_handler);
//                                                window.document.body.addEventListener('keypress',self.payment_self.keyboard_handler);
//                                                window.document.body.addEventListener('keydown',self.payment_self.keyboard_keydown_handler);
                                                if (cashregisters){
                                                    order.add_paymentline(cashregisters);
                                                    order.selected_paymentline.set_amount( Math.max(redeem_amount),0 );
                                                    order.selected_paymentline.set_giftcard_line_code(code);
                                                    order.selected_paymentline.set_freeze(true);
                                                    self.chrome.screens.payment.reset_input();
                                                    self.chrome.screens.payment.render_paymentlines();
                                                    order.set_redeem_giftcard(vals);
                                                } 
                                            }
                                            this.gui.close_popup();
                                        }
                                    }else{
                                        self.pos.db.notification('danger',_t('Please enter amount below card value.'));
                                        $('#text_redeem_amount').focus();
                                    }
                                }else{
                                    self.pos.db.notification('danger',_t('Please enter valid amount.'));
                                    $('#text_redeem_amount').focus();
                                }
                            }else{
                                self.pos.db.notification('danger',_t('Card amount should be less than or equal to Order Due Amount.'));
                            } 
                            
                        }else{
                            self.pos.db.notification('danger',_t('Please enter amount.'));
                            $('#text_redeem_amount').focus();
                        }
                    }
                }else{
                    self.pos.db.notification('danger',_t('Please enter valid barcode.'));
                    $('#text_gift_card_no').focus();
                }
            }else{
//            	self.pos.db.notification('danger',_t('Press enter key.'));
                $('#text_gift_card_no').focus();
            }
        },
    });
    gui.define_popup({name:'redeem_card_popup', widget: RedeemCardPopupWidget});

    var RechargeCardPopupWidget = PopupWidget.extend({
        template: 'RechargeCardPopupWidget',

        show: function(options){
            self = this;
            this._super();
            self.pending_card = options.recharge_card_data;
            if(!self.pending_card){
                this.card_no = options.card_no || "";
                this.card_id = options.card_id || "";
                this.card_value = options.card_value || 0 ;
                this.customer_id = options.customer_id || "";
            }
            this.renderElement();
            $('#text_recharge_amount').focus();
            $("#text_recharge_amount").keypress(function (e) {
                if(e.which != 8 && e.which != 0 && (e.which < 48 || e.which > 57) && e.which != 46) {
                    return false;
                }
            });
        },

        click_confirm: function(){
            var self = this;
            var order = self.pos.get_order();
            var client = order.get_client();
            var set_customer = $('#set_customers').val();
            if(!client){
                order.set_client(self.pos.db.get_partner_by_id(set_customer));
            }
            var recharge_amount = this.$('#text_recharge_amount').val();
            if (recharge_amount){
                if( 0 < Number(recharge_amount) ){
                    var vals = {
                    'recharge_card_id':self.card_id,
                    'recharge_card_no':self.card_no,
                    'recharge_card_amount':Number(recharge_amount),
                    'card_customer_id': self.customer_id[0] || false,
                    'customer_name': self.customer_id[1],
                    'total_card_amount':Number(recharge_amount)+self.card_value,
                    }
                    var get_recharge = order.get_recharge_giftcard();
                    if(get_recharge){
                        if (self.pos.config.gift_card_product_id[0]){
                            var product = self.pos.db.get_product_by_id(self.pos.config.gift_card_product_id[0]);
                            if(product){
                                order.empty_cart();
                                var line = new models.Orderline({}, {pos: self.pos, order: order, product: product});
                                line.set_unit_price(recharge_amount);
                                order.add_orderline(line);
                                order.select_orderline(order.get_last_orderline());
                            }else{
                                return self.pos.gui.show_popup('flexi_alert',{
                                    'title':_t('Warning'),
                                    'body':_t('Gift card product is not loaded in point of sale, Please check product'),
                                });
                            }
                        }else{
                            return self.pos.gui.show_popup('flexi_alert',{
                                'title':_t('Warning'),
                                'body':_t('Please configure gift card product in pos configuration'),
                            });
                        }
                        if(self.pos.config.msg_before_card_pay){
                            self.gui.show_popup('confirmation_card_payment',{'rechage_card_data':vals})
                        } else {
                            order.set_recharge_giftcard(vals);
                            self.gui.show_screen('payment');
                            $("#card_back").hide();
                            $( "div.js_set_customer" ).off("click");
                            $( "div#card_invoice" ).off("click");
                            this.gui.close_popup();
                        }
                          
                    }
                }else{
                    self.pos.db.notification('danger',_t('Please enter valid amount.'));
                   $('#text_recharge_amount').focus();
                }
            }else{
                self.pos.db.notification('danger',_t('Please enter amount.'));
                $('#text_recharge_amount').focus();
            }
        },
    });
    gui.define_popup({name:'recharge_card_popup', widget: RechargeCardPopupWidget});

    var EditCardPopupWidget = PopupWidget.extend({
        template: 'EditCardPopupWidget',

        show: function(options){
            self = this;
            this._super();
            this.card_no = options.card_no || "";
            this.card_id = options.card_id || "";
            this.expire_date = options.expire_date || "";
            this.renderElement();
            $('#new_expire_date').focus();
            $('#new_expire_date').keypress(function(e){
                if( e.which == 8 || e.keyCode == 46 ) return true;
                return false;
            });
        },

        click_confirm: function(){
            var self = this;
            var new_expire_date = this.$('#new_expire_date').val();
            if(new_expire_date){
                if(self.card_no){
                    var params = {
                        model: "aspl.gift.card",
                        method: "write",
                        args: [self.card_id,{'expire_date':new_expire_date}]
                    }
                    rpc.query(params, {async: false})
                    .then(function(res){
                        if(res){
                            self.pos.gui.chrome.screens.giftcardlistscreen.reloading_gift_cards();
                        }
                    }).fail(function(){
                        self.pos.db.notification('danger',"Connection lost");
                    });
                    this.gui.close_popup();
                }else{
                    self.pos.db.notification('danger',_t('Please enter valid card no.'));
                }
            }else{
                self.pos.db.notification('danger',_t('Please select date.'));
                $('#new_expire_date').focus();
            }
        },

        renderElement: function() {
            var self = this;
            this._super();
            $('.date').datepicker({
                minDate: 0,
                dateFormat:'yy/mm/dd',
            });
            self.$(".emptybox_time").click(function(){ $('#new_expire_date').val('') });
        },
    });
    gui.define_popup({name:'edit_card_popup', widget: EditCardPopupWidget});

    var ExchangeCardPopupWidget = PopupWidget.extend({
        template: 'ExchangeCardPopupWidget',
        show: function(options){
            self = this;
            this._super();
            this.card_no = options.card_no || "";
            this.card_id = options.card_id || "";
            this.renderElement();
            $('#new_card_no').focus();
            var timestamp = new Date().getTime()/1000;
            if(self.pos.config.manual_card_number){
                $('#new_card_no').removeAttr("readonly");
                $("#new_card_no").keypress(function (e) {
                    if (e.which != 8 && e.which != 0 && (e.which < 48 || e.which > 57) && e.which != 46) {
                        return false;
                   }
                });
            } else{
                $('#new_card_no').val(window.parseInt(timestamp));
                $('#new_card_no').attr("readonly", "readonly");
            }
        },

        click_confirm: function(){
            var self = this;
            if(self.card_no){
                var card_number = $('#new_card_no').val();
                var move = true;
                if(!card_number){
                    self.pos.db.notification('danger',_t('Enter gift card number.'));
                    return;
                } else{
                    var params = {
                        model: 'aspl.gift.card',
                        method: 'search_read',
                        domain: [['card_no', '=', $('#new_card_no').val()]],
                    }
                    rpc.query(params, {async: false})
                    .then(function(gift_count){
                        gift_count = gift_count.length
                        if(gift_count > 0){
                            $('#new_card_no').css('border', 'thin solid red');
                            move = false;
                        } else{
                            $('#new_card_no').css('border', '0px');
                        }
                    }).fail(function(){
                        self.pos.db.notification('danger',"Connection lost");
                    });
                }
                if(!move){
                    self.pos.db.notification('danger',_t('Card already exist.'));
                    return
                }
               var exchange_card_no = confirm("Are you sure you want to change card number?");
               if( exchange_card_no){
                  var params = {
                     model: "aspl.gift.card",
                     method: "write",
                     args: [[self.card_id],{'card_no':this.$('#new_card_no').val()}],
                  }
                  rpc.query(params, {async: false})
                  .then(function(res){
                      if(res){
                          self.pos.gui.chrome.screens.giftcardlistscreen.reloading_gift_cards();
                      }
                  }).fail(function(){
                    self.pos.db.notification('danger',"Connection lost");
                  });
                  this.gui.close_popup();
               }
            }
        },
    });

    gui.define_popup({name:'exchange_card_popup', widget: ExchangeCardPopupWidget});

    var ConfirmationCardPayment = PopupWidget.extend({
        template: 'ConfirmationCardPayment',

        show: function(options){
            self = this;
            this._super();
            self.options = options.card_data || false;
            self.recharge_card = options.rechage_card_data || false;
            self.renderElement();
        },
        click_confirm: function(){
            var self = this;
            var order = self.pos.get_order();
            if(self.recharge_card){
                var vals = {
                    'recharge_card_id':self.recharge_card.recharge_card_id,
                    'recharge_card_no':self.recharge_card.recharge_card_no,
                    'recharge_card_amount':self.recharge_card.recharge_card_amount,
                    'card_customer_id': self.recharge_card.card_customer_id || false,
                    'customer_name': self.recharge_card.customer_name,
                    'total_card_amount':self.recharge_card.total_card_amount,
                }
                order.set_recharge_giftcard(vals);
                self.gui.show_screen('payment');
                $("#card_back").hide();
//                $("div.js_set_customer").off("click");
//                $("div#card_invoice").off("click");
                $('.payment-buttons .control-button').off('click');
                this.gui.close_popup();
            } else if(self.options){
                var gift_order = {'giftcard_card_no': self.options.giftcard_card_no,
                        'giftcard_customer': self.options.giftcard_customer ? Number(self.options.giftcard_customer) : false,
                        'giftcard_expire_date': self.options.giftcard_expire_date,
                        'giftcard_amount': self.options.giftcard_amount,
                        'giftcard_customer_name': self.options.giftcard_customer_name,
                        'card_type': self.options.card_type,
                }
                order.set_giftcard(gift_order);
                self.gui.show_screen('payment');
                $("#card_back").hide();
//                $("div.js_set_customer").off("click");
//                $("div#card_invoice").off("click");
                $('.payment-buttons .control-button').off('click');
                this.gui.close_popup();
            }
        },
        click_cancel: function(){
            var self = this;
            if(self.recharge_card){
                self.gui.show_popup('recharge_card_popup',{'recharge_card_data':self.recharge_card})
            }else if(self.options){
                self.gui.show_popup('create_card_popup',{'card_data':self.options});
            }

        }
    });

    gui.define_popup({name:'confirmation_card_payment', widget: ConfirmationCardPayment});

    var RedeemGiftVoucherPopup = PopupWidget.extend({
        template: 'RedeemGiftVoucherPopup',
        show: function(options){
            var self = this;
            this.payment_self = options.payment_self || false;
            this._super();
            var order = self.pos.get_order();
            var total_pay = order.get_total_with_tax();
            self.self_voucher = false ;
            $('body').off('keypress', this.payment_self.keyboard_handler);
            $('body').off('keydown',this.payment_self.keyboard_keydown_handler);
//            window.document.body.removeEventListener('keypress',self.payment_self.keyboard_handler);
//        	window.document.body.removeEventListener('keydown',self.payment_self.keyboard_keydown_handler);
            this.renderElement();
            $('#gift_voucher_text').focus();
            $('#gift_voucher_text').keypress(function(e) {
                if (e.which == 13 && $(this).val()) {
                    var today = moment().locale('en').format('YYYY-MM-DD');
                    var code = $(this).val();
                    var params = {
                        model: 'aspl.gift.voucher',
                        method: 'search_read',
                        domain: [['voucher_code', '=', code], ['expiry_date', '>=', today]],
                    }
                    rpc.query(params, {async: false})
                    .then(function(res){
                        if(res.length > 0){
                            var due = order.get_total_with_tax() - order.get_total_paid();
                            if (res[0].minimum_purchase <= total_pay && res[0].voucher_amount <= due){
                                    self.self_voucher = res[0]
                                    $('#barcode').html("Amount: "+ self.format_currency(res[0].voucher_amount))
                            }else{
                                self.pos.db.notification('danger',_t("Due amount should be equal or above to "+self.format_currency(res[0].minimum_purchase)));
                            }
                        }else{
                            $('#barcode').html("")
                            self.self_voucher = false ;
                            self.pos.db.notification('danger',_t("Voucher not found or voucher has been expired"));
                        }
                    }).fail(function(){
                        self.pos.db.notification('danger',"Connection lost");
                    });
                }
            });
        },
        click_confirm: function(){
            var self = this;
            var order = self.pos.get_order();
            var vouchers = order.get_voucher();
            var paymentlines = order.get_paymentlines();
            var cashregister = false;
            var code = $(gift_voucher_text).val();
            if (paymentlines.length > 0){
                self.chrome.screens.payment.click_delete_paymentline(paymentlines.cid)
            }
            if (self.self_voucher){
                var pid = Math.floor(Math.random() * 90000) + 10000;
                self.self_voucher['pid'] = pid
                if (self.pos.config.gift_voucher_journal_id.length > 0){
                    for ( var i = 0; i < self.pos.cashregisters.length; i++ ) {
                        if ( self.pos.cashregisters[i].journal_id[0] === self.pos.config.gift_voucher_journal_id[0] ){
                           cashregister = self.pos.cashregisters[i]
                        }
                    }
                    if (cashregister){
                        if(!vouchers){
                            self.check_redemption_customer().then(function(redeem_count){
                                if (redeem_count == 0 || redeem_count < self.self_voucher.redemption_customer){
                                    order.add_paymentline(cashregister);
                                    order.selected_paymentline.set_amount( Math.max(self.self_voucher.voucher_amount, 0) );
                                    order.selected_paymentline.set_gift_voucher_line_code(code);
                                    order.selected_paymentline.set_pid(pid);
                                    self.chrome.screens.payment.reset_input();
                                    self.chrome.screens.payment.render_paymentlines();
                                    order.set_voucher(self.self_voucher);
                                    self.gui.close_popup();
                                    $('body').off('keypress', self.keyboard_handler).keypress(self.payment_self.keyboard_handler);
                                    $('body').off('keydown',self.keyboard_keydown_handler).keydown(self.payment_self.keyboard_keydown_handler);
//								    window.document.body.addEventListener('keypress',self.payment_self.keyboard_handler);
//        							window.document.body.addEventListener('keydown',self.payment_self.keyboard_keydown_handler);
                                } else {
                                    self.pos.db.notification('danger',_t("Your voucher use's limit has been expired"));
                                }
                            });
                        } else {
                            if (self.self_voucher.voucher_code == code){
                                var voucher_use = _.countBy(vouchers, 'voucher_code');
                                if (voucher_use[code]){
                                    if(self.self_voucher.redemption_order > voucher_use[code]){
                                        self.check_redemption_customer().then(function(redeem_count){
                                            redeem_count += voucher_use[code];
                                            if (redeem_count == 0 || redeem_count < self.self_voucher.redemption_customer){
                                                order.add_paymentline(cashregister);
                                                order.selected_paymentline.set_amount( Math.max(self.self_voucher.voucher_amount, 0) );
                                                order.selected_paymentline.set_gift_voucher_line_code(code);
                                                order.selected_paymentline.set_pid(pid);
                                                self.chrome.screens.payment.reset_input();
                                                self.chrome.screens.payment.render_paymentlines();
                                                order.set_voucher(self.self_voucher);
                                                self.gui.close_popup();
                                                $('body').off('keypress', self.keyboard_handler).keypress(self.payment_self.keyboard_handler);
                                                $('body').off('keydown',self.keyboard_keydown_handler).keydown(self.payment_self.keyboard_keydown_handler);
//											    $('body').keypress(self.payment_self.keyboard_handler);
//										        $('body').keydown(self.payment_self.keyboard_keydown_handler);
//											    window.document.body.addEventListener('keypress',self.payment_self.keyboard_handler);
//        										window.document.body.addEventListener('keydown',self.payment_self.keyboard_keydown_handler);
                                            } else {
                                                self.pos.db.notification('danger',_t("Your voucher use's limit has been expired"));
                                            }
                                        });
                                    } else {
                                        self.pos.db.notification('danger',_t("Voucher limit has been expired for this order"));
                                        $('#barcode').html("")
                                        $('#gift_voucher_text').focus();
                                    }
                                } else {
                                    self.check_redemption_customer().then(function(redeem_count){
                                        if (redeem_count == 0 || redeem_count < self.self_voucher.redemption_customer){
                                            self.self_voucher['already_redeemed'] = redeem_count;
                                            order.add_paymentline(cashregister);
                                            order.selected_paymentline.set_amount(Math.max(self.self_voucher.voucher_amount, 0) );
                                            order.selected_paymentline.set_gift_voucher_line_code(code);
                                            order.selected_paymentline.set_pid(pid);
                                            self.chrome.screens.payment.reset_input();
                                            self.chrome.screens.payment.render_paymentlines();
                                            order.set_voucher(self.self_voucher);
                                            self.gui.close_popup();
                                            $('body').off('keypress', self.keyboard_handler).keypress(self.payment_self.keyboard_handler);
                                            $('body').off('keydown',self.keyboard_keydown_handler).keydown(self.payment_self.keyboard_keydown_handler);
//											$('body').keypress(self.payment_self.keyboard_handler);
//									        $('body').keydown(self.payment_self.keyboard_keydown_handler);
//											window.document.body.addEventListener('keypress',self.payment_self.keyboard_handler);
//        									window.document.body.addEventListener('keydown',self.payment_self.keyboard_keydown_handler);
                                        } else {
                                            self.pos.db.notification('danger',_t("Your voucher use's limit has been expired"));
                                        }
                                    });
                                }
                            } else {
                                self.pos.db.notification('danger',_t("Voucher barcode is invalid"));
                            }
                        }
                    }
                } else {
                    self.pos.db.notification('danger',_t("Please set Journal for gift voucher in POS Configuration"));
                }
            } else {
//				self.pos.db.notification('danger',_t("Press enter to get voucher amount"));
                $('#gift_voucher_text').focus();
            }
        },
        click_cancel: function(){
            var self = this;
            self._super();
            $('body').off('keypress', self.keyboard_handler).keypress(self.payment_self.keyboard_handler);
            $('body').off('keydown',self.keyboard_keydown_handler).keydown(self.payment_self.keyboard_keydown_handler);
//        	$('body').keypress(self.payment_self.keyboard_handler);
//	        $('body').keydown(self.payment_self.keyboard_keydown_handler);
//        	window.document.body.addEventListener('keypress',self.payment_self.keyboard_handler);
//        	window.document.body.addEventListener('keydown',self.payment_self.keyboard_keydown_handler);
        },
        check_redemption_customer: function(){
            var self = this;
            var order = self.pos.get_order();
            var domain = [['voucher_id', '=', self.self_voucher.id]];
            if(order.get_client()){
                domain.push(['customer_id', '=', order.get_client().id])
            }
            var params = {
                model: 'aspl.gift.voucher.redeem',
                method: 'search_count',
                args: [domain],
            }
            return rpc.query(params, {async: false}).fail(function(){
                self.pos.db.notification('danger',"Connection lost");
            });
        }
    });
    gui.define_popup({name:'redeem_gift_voucher_popup', widget: RedeemGiftVoucherPopup});

    var LockPopupWidget = PopupWidget.extend({
        template:'LockPopupWidget',
        show: function(options){
            var self = this;
            this._super(options);
            this.$('.close-lock-btn').click(function(){
                self.gui.close_popup();
            });
            this.$('.lock-pos').click(function(){
                self.gui.close_popup();
                var current_screen = self.pos.gui.get_current_screen();
                var user = self.pos.get_cashier();
                self.pos.set_locked_user(user.login);
                if(current_screen){
                    self.pos.set_locked_screen(current_screen);
                }
                var params = {
                    model: 'pos.session',
                    method: 'write',
                    args: [self.pos.pos_session.id,{'is_lock_screen' : true}],
                }
                rpc.query(params, {async: false}).fail(function(){
                    self.pos.db.notification('danger',"Connection lost");
                });
                $('.lock_button').css('background-color', 'rgb(233, 88, 95)');
                $('.freeze_screen').addClass("active_state");
                $(".unlock_button").fadeIn(2000);
                $('.unlock_button').show();
                $('.unlock_button').css('z-index',10000);
            });
        },
    });
    gui.define_popup({name:'lock_popup', widget: LockPopupWidget});

    var TerminalListPopup = PopupWidget.extend({
        template: 'TerminalListPopup',
        start: function(){
            var self = this;
            this._super();
        },
        show: function(options){
            var self = this;
            options = options || {};
            this._super(options);
            this.session_list = options.sessions;
            var message = "";
            self.render_list(self.session_list);
            var prev_id = "";
            var flag_broad_cast = false;
            self.popup_design();
            $('.terminal-list-contents').delegate('#toggle_session','click',function(event){
                var session_id = parseInt($(this).data('id'));
                var session = self.pos.session_by_id[session_id];
                if(session){
                    var status = false;
                    if(session.locked){
                        status = false;
                        session['locked'] = false;
                    } else{
                        status = true;
                        session['locked'] = true;
                    }
                    var params = {
                        model: 'lock.data',
                        method: 'lock_session_log',
                        args: [session_id,session.current_cashier_id[0],self.pos.get_cashier(),status],
                    }
                    rpc.query(params, {async: false}).then(function(result){
                        if(result && result[0]){
                            for(var i = self.session_list.length - 1; i >= 0; i--) {
                                if(self.session_list[i].id == result[0].id) {
                                    self.session_list[i].locked_by_user_id = result[0].locked_by_user_id;
                                }
                            }
                        }else{
                            session['locked'] = true;
                            self.pos.db.notification('danger',"This operation is done by another user.");
                        }
                        self.render_list(self.session_list);
                    }).fail(function(){
                        self.pos.db.notification('danger',"Connection lost");
                    });
                }
            });
            $('.terminal-list-contents').delegate('.line_message_btn','click',function(event){
                self.popup_design('with_chat');
                self.line_session_id = parseInt($(this).data('id'));
                $('#session_message_txtarea').val("");
                $('.line_message_btn').css('color','#5EB937');
                $(this).css('color','#7f82ac')
                flag_broad_cast = false;
                if(self.line_session_id == prev_id){
                    self.popup_design();
                    prev_id = "";
                    $('.line_message_btn').css('color','#5EB937');
                } else{
                    prev_id = self.line_session_id;
                }
                var session = self.pos.session_by_id[self.line_session_id];
                $('#session_message_txtarea').focus();
                if(self.pos.pos_session.current_cashier_id){
                    $('#to_send_user_name').text(session.current_cashier_id[1])
                } else{
                    $('#to_send_user_name').text(session.user_id[1])
                }
            });
            $('#message_area_container').delegate('#session_message_txtarea','keypress',function(e){
                message = "";
                if(e.keyCode == 13){
                    message = $('#session_message_txtarea').val();
                    message = message.trim()
                    var session_id = self.line_session_id;
                    var session = self.pos.session_by_id[session_id];
                    if(flag_broad_cast){
                        var params = {
                            model: 'message.terminal',
                            method: 'broadcast_message_log',
                            args:[self.session_list,self.pos.get_cashier().id,message]
                        }
                        rpc.query(params, {async: false}).then(function(result){
                            if(result){
                                $('#session_message_txtarea').val("");
                            }
                        }).fail(function(){
                            self.pos.db.notification('danger',"Connection lost");
                        });
                    }else{
                        if(session && message){
                            var params = {
                                model: 'message.terminal',
                                method: 'create',
                                args:[{'message_session_id':session_id,
                                'receiver_user':session.current_cashier_id[0],
                                'sender_user':self.pos.get_cashier().id,
                                'message':message}]
                            }
                            rpc.query(params, {async: false}).then(function(result){
                                if(result){
                                    $('#session_message_txtarea').val("");
                                }
                            }).fail(function(){
                                self.pos.db.notification('danger',"Connection lost");
                            });
                        }
                    }
                }
            });
            $('.close_terminal_list').click(function(){
                self.gui.close_popup();
            });
            $('.broadcast_message').click(function(){
                self.popup_design("with_chat")
                $('#session_message_txtarea').val("");
                $('.line_message_btn').css('color','#5EB937');
                $('#to_send_user_name').text("Broadcast");
                prev_id = "";
                flag_broad_cast = true;
            });
        },
        popup_design: function(design){
            if(design == 'with_chat'){
                $("#message_area_container").show();
                $('#popup_design_change').removeClass('popup_without_chat');
                $('#sessionlist_container').removeClass('session_list_without_chat');
                $('#popup_design_change').addClass('popup_with_chat');
                $('#sessionlist_container').addClass('session_list_with_chat');
            } else{
                $("#message_area_container").hide();
                $('#popup_design_change').removeClass('popup_with_chat');
                $('#sessionlist_container').removeClass('session_list_with_chat');
                $('#popup_design_change').addClass('popup_without_chat');
                $('#sessionlist_container').addClass('session_list_without_chat');
                $("#message_area_container").css('display','none !important');
            }
        },
        click_confirm: function(){
            var self = this;
            if(self.session_list && self.session_list[0]){
                var params = {
                    model: 'lock.data',
                    method: 'lock_unlock_all_session',
                    args: [self.session_list,self.pos.get_cashier(),true],
                }
                rpc.query(params, {async: false}).then(function(result){
                    if(result){
                        self.session_list = result;
                        _.each(self.session_list,function(session){
                            self.pos.session_by_id[session.id] = session;
                        });
                    }
                }).fail(function(){
                    self.pos.db.notification('danger',"Connection lost");
                });
                self.render_list(self.session_list);
            }
        },
        click_cancel: function(){
            var self = this;
            if(self.session_list && self.session_list[0]){
                var params = {
                    model: 'lock.data',
                    method: 'lock_unlock_all_session',
                    args: [self.session_list,self.pos.get_cashier(),false],
                }
                rpc.query(params, {async: false}).then(function(result){
                    if(result){
                        self.session_list = result;
                        _.each(self.session_list,function(session){
                            self.pos.session_by_id[session.id] = session;
                        });
                    }
                }).fail(function(){
                    self.pos.db.notification('danger',"Connection lost");
                });
                self.render_list(self.session_list);
            }
        },
        render_list: function(session_list){
            var self = this;
            var contents = this.$el[0].querySelector('.terminal-list-contents');
            contents.innerHTML = "";
            for(var i=0;i<session_list.length;i++){
                var session = session_list[i];
                var sessionline_html = QWeb.render('SessionLine',{widget: this, session:session_list[i]});
                var sessionline = document.createElement('tbody');
                sessionline.innerHTML = sessionline_html;
                sessionline = sessionline.childNodes[1];
                contents.appendChild(sessionline);
            }
        },
    });
    gui.define_popup({name:'terminal_list', widget: TerminalListPopup});

    var ProductQtyAdvancePopupWidget = PopupWidget.extend({
        template: 'ProductQtyAdvancePopupWidget',
        show: function(options){
            options = options || {};
            this.prod_info_data = options.prod_info_data || false;
            this.total_qty = options.total_qty || '';
            this.product = options.product || false;
            this._super(options);
            this.renderElement();
        },
        renderElement: function(){
            var self = this;
            this._super();
            $(".input_qty").keyup(function(e){
                if($.isNumeric($(this).val()) || e.key == "Backspace"){
                    var remaining_qty = $(this).attr('loaction-data');
                    var qty = Number($(this).val());
                    if(qty > 10){
                        self.pos.db.notification('danger',_t('Can not add more than remaining quantity.'));
                        $(this).val(0);
                    }
                } else {
                    $(this).val(0);
                }
            });
        },
        click_confirm: function(){
            var self = this;
            var order = self.pos.get_order();
            for(var i in this.prod_info_data){
                var loc_id = this.prod_info_data[i][2]
                if($("#"+loc_id).val() && Number($("#"+loc_id).val()) > 0){
                    order.add_product(this.product,{quantity:$("#"+loc_id).val(),force_allow:true})
                    order.get_selected_orderline().set_location_id(this.prod_info_data[i][2]);
                    order.get_selected_orderline().set_location_name(this.prod_info_data[i][0]);
                }
            }
            this.gui.close_popup();
        },
    });
    gui.define_popup({name:'product_qty_advance_popup', widget: ProductQtyAdvancePopupWidget});

    var AddToWalletPopup = PopupWidget.extend({
        template: 'AddToWalletPopup',
        show: function(options){
            var self = this;
            var order = self.pos.get_order();
            options = options || {};
            this.change = order.get_change() || false;
            this._super(options);
            this.renderElement();
        },
        click_confirm: function(){
            var self = this;
            var order = self.pos.get_order();
            if(!self.pos.config.cash_control){
                self.pos.db.notification('danger',_t("Please enable cash control from point of sale settings."));
            }
            if(order.get_client()){
                order.set_type_for_wallet('change');
                order.set_change_amount_for_wallet(order.get_change());
                this.validate();
            } else {
                if(confirm("To add money into wallet you have to select a customer or create a new customer \n Press OK for go to customer screen \n Press Cancel to Discard.")){
                    self.gui.show_screen('clientlist');
                }else{
                    this.gui.close_popup();
                }
            }
        },
        click_cancel: function(){
            var self = this;
            var order = self.pos.get_order();
            self.validate();
            this.gui.close_popup();
        },
        validate: function(){
            var self = this;
            var order = self.pos.get_order();
            var currentOrder = order;
            self.pos.push_order(order).then(function(){
                setTimeout(function(){
                    self.gui.show_screen('receipt');
                },1000)
            });
            this.gui.close_popup();
        }
    });
    gui.define_popup({name:'AddToWalletPopup', widget: AddToWalletPopup});


    var MaxCreditExceedPopupWidget = PopupWidget.extend({
        template: 'MaxCreditExceedPopupWidget',
        show: function(options){
            var self = this;
            this._super(options);
        },
        events: _.extend({}, PopupWidget.prototype.events, {
            'click .button.override_payment':  'click_override_payment',
        }),
        click_override_payment: function(){
            var self = this;
            var currentOrder = this.pos.get_order();
            if(self.options.payment_obj){
                if(!currentOrder.get_paying_due() && !currentOrder.get_cancel_order()){
                    currentOrder.set_fresh_order(true);
                }
//                if(currentOrder.get_total_paid() != 0){
//                    this.options.payment_obj.finalize_validation();
//                    this.gui.close_popup();
//                }
//                $('.js_reservation_mode').removeClass('highlight');
            } else if(self.options.draft_order){
                this.pos.push_order(this.pos.get_order());
                self.gui.show_screen('receipt');
                this.gui.close_popup();
            }
        },
    });
    gui.define_popup({name:'max_limit', widget: MaxCreditExceedPopupWidget});

    var MergeTablePopup = PopupWidget.extend({
        template: 'MergeTablePopup',
        show: function(options){
            options = options || {};
            this._super(options);
        },
        click_confirm: function(){
            var self = this;
            var order = self.pos.get_order();
            var merge_table_ids = [];
            _.each($('div#merge_table_div'), function(item){
                if($(item).hasClass('selected_table')){
                    merge_table_ids.push($(item).data('id'));
                }
            });
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
                merge_table_ids.push(self.pos.table.id);
                order.set_merge_table_ids(merge_table_ids);
            }else{
                order.set_merge_table_ids([self.pos.table.id]);
            }
            if(order.get_merge_table_ids() && order.get_merge_table_ids()[0]){
                var merged_tables = [];
                order.get_merge_table_ids().map(function(id){
                    if(self.pos.table.id != id){
                        var table_name = self.pos.tables_by_id[id];
                        if(table_name && table_name.name){
                            merged_tables.push(table_name);
                            table_name.parent_linked_table = self.pos.table;
                            self.pos.table.is_parent = true;
                        }
                    }
                });
                $('span.orders.touch-scrollable .floor-button').replaceWith(QWeb.render('BackToFloorButton',{table: self.pos.table, floor:self.pos.table.floor,merged_tables:merged_tables}));
                $('span.orders.touch-scrollable .floor-button').click(function(){
                    self.pos.chrome.widget.order_selector.floor_button_click_handler();
                });
            }
            self.gui.close_popup();
        },
        renderElement: function() {
            var self = this;
            this._super();
            $('div#merge_table_div').click(function(){
                var id = $(this).data('id');
                if($(this).hasClass('selected_table')){
                    $(this).removeClass('selected_table');
                }else{
                    $(this).addClass('selected_table');
                }
            });
        },
    });
    gui.define_popup({name:'merge_table_popup', widget: MergeTablePopup});

    var CashControlWizardPopup = PopupWidget.extend({
        template : 'CashControlWizardPopup',
        show : function(options) {
            var self = this;
            options = options || {};
            this.title = options.title || ' ';
            this.statement_id = options.statement_id || false;
            this.statement_ids = null;
            var selectedOrder = self.pos.get_order();
            this._super();
            this.renderElement();
            var self = this;
            $(document).keypress(function (e) {
                if (e.which != 8 && e.which != 46 && e.which != 0 && (e.which < 48 || e.which > 57)) {
                    return false;
                }
            });
            var statement_ids = [];
            var session_data = {
                model: 'pos.session',
                method: 'search_read',
                domain: [['id', '=', self.pos.pos_session.id]],
            }
            rpc.query(session_data, {async: false}).then(function(data){
                if(data){
                     _.each(data, function(value){
                        $("#open_bal").text(self.format_currency(value.cash_register_balance_start));
                        $('.button.close_session').show();
                        if (value.statement_ids){
                            rpc.query({
                                model: 'account.bank.statement', 
                                method: 'search_read',
                                fields: [],
                                domain: [['id', 'in', value.statement_ids]]
                            }).then(function(results){
                               self.transactions = [];
                               self.sum_t = 0;
                               self.sum_real = 0;
                               self.teorical_val = 0;
                               self.real_close = [];
                                _.each(results, function(result){
                                    self.transactions.push(result.total_entry_encoding);
                                    var table = $('.table-method-cash');
                                    var el_str = QWeb.render('PaymentMethodsCash', {widget: self, result: result});
                                    var el_node = document.createElement('tbody');
                                        el_node.innerHTML = el_str;
                                        el_node = el_node.childNodes[1];
                                        /*$(el_node).find('.balance_end_real').addEventListener('focusout', function(e){
                                            console.log(e);
                                        });*/
                                    
                                    /*var balance_real = el_node.querySelectorAll('.balance_end_real');
                                    var rows = el_node.querySelectorAll('span');
                                    for (var i = 0; i < rows.length; i++){
                                        var row = $(rows[i]);

                                        var value_diff = 0;
                                        var value_entry_enc = 0;
                                        if (row[0].className == 'balance_end_real' || balance_real){
                                            var balance_end_real = row[0];
                                            balance_end_real.addEventListener('focusout', function(e){
                                                var val = $(this).text();
                                                var total_entry_encoding = this.parentElement.parentElement.querySelector('.total_entry_encoding');
                                                var difference = this.parentElement.parentElement.querySelector('.difference');
                                                $(difference).text(self.format_currency(val - $(total_entry_encoding).text()));
                                                //var balance_real = el_node.querySelectorAll('.balance_end_real');
                                                _.each(balance_real, function(re){
                                                    var current_val = $(re).text();
                                                    self.real_close.push(parseInt(current_val));
                                                });
                                                console.log(self.real_close);
                                                self.sum_t = _.reduce(self.transactions, function(n, num){return n + num}, 0);
                                                self.sum_real = _.reduce(self.real_close, function(n, num){ return n+num;}, 0);
                                                self.teorical_val = self.sum_t + value.cash_register_balance_start;

                                                //self.sum_real = _.reduce(self.real_close, function(n, num){ return n+num;}, 0);
                                                $("#real_close_bal").text(self.format_currency(self.sum_real));
                                                $("#differ").text(self.format_currency(self.sum_real + self.teorical_val));
                                                self.real_close = [];
                                            });
                                        }
                                    }*/
                                    /*
                                    if (balance_end_real){
                                        balance_end_real[0].addEventListener('focusout', function(e){
                                            var balance_real = $('.balance_end_real');
                                            var difference = el_node.querySelectorAll('.difference');
                                            _.each(balance_real, function(re){
                                                var val = $(re).text();
                                                self.real_close.push(parseInt(val));
                                                for (var i=0; i < difference.length; i++){
                                                    var dif = $(difference[i]).text();
                                                }
                                            });
                                            self.sum_t = _.reduce(self.transactions, function(n, num){return n + num}, 0);
                                            self.sum_real = _.reduce(self.real_close, function(n, num){ return n+num;}, 0);
                                            self.teorical_val = self.sum_t + value.cash_register_balance_start;
                                            
                                            //self.sum_real = _.reduce(self.real_close, function(n, num){ return n+num;}, 0);
                                            $("#real_close_bal").text(self.format_currency(self.sum_real));
                                            $("#differ").text(self.format_currency(self.sum_real + self.teorical_val));
                                            self.real_close = [];
                                        });
                                    }*/
                                    table.append(el_node);
                                });
                                this.statement_ids = results;
                                self.sum_t = _.reduce(self.transactions, function(n, num){return n + num}, 0);
                                self.sum_real = _.reduce(self.real_close, function(n, num){ return n+num;}, 0);
                                self.teorical_val = self.sum_t + value.cash_register_balance_start;
                                $("#transaction").text(self.format_currency(self.sum_t));
                                $("#theo_close_bal").text(self.format_currency(self.teorical_val));
                            })
                        }
                     });
                }
            });

            $("#cash_details").show();
            this.$('.button.close_session').hide();
            this.$('.button.ok').click(function() {
                var dict = [];
                var items=[]
                var cash_details = [];
                var cash_subtotal = $('.subtotal_end');
                
                var cash_value = cash_subtotal.text().replace('$','');
                var cash_journal_id = $('.journal_id');

                if (cash_value > 0){
                    for (var i=0; i < cash_journal_id.length; i++) {
                        var journal_ef = cash_journal_id[i];
                        if (journal_ef.innerHTML === 'Efectivo (MXN)') {
                            var tr = $(journal_ef.parentElement.parentElement);
                            tr.find('.balance_end_real').val(parseFloat(cash_value));
                        }
                    }
                }

                var cash_register_values = $('.balances-cash');
                var cash_reg = $('.balances-cash');
                
                for (var i = 0; i < cash_reg.length; i++){
                    var journal_id = $(cash_reg[i]).find('span.journal_id').attr('id');
                    var balance_end_real = $(cash_reg[i]).find('input.balance_end_real').val();
                    statement_ids.push({
                        journal_id: journal_id,
                        balance_end_real: balance_end_real.replace('$',''),
                    })
                }
                
                $(".cashcontrol_td").each(function(){
                    items.push($(this).val());
                });
                while (items.length > 0) {
                  cash_details.push(items.splice(0,3))
                }
                
                _.each(cash_details, function(cashDetails){
                    if(cashDetails[2] > 0.00){
                        dict.push({
                           'coin_value':Number(cashDetails[0]),
                           'number_of_coins':Number(cashDetails[1]),
                           'subtotal':Number(cashDetails[2]),
                           'pos_session_id':self.pos.pos_session.id
                        });        
                    }
                });
                
                if(dict.length > 0){
                    var params = {
                        model: 'pos.session',
                        method: 'cash_control_line',
                        args:[self.pos.pos_session.id,dict,statement_ids]
                    }
                    rpc.query(params, {async: false}).then(function(res){
                            if(res){
                            }
                    }).fail(function (type, error){
                        if(error.code === 200 ){    // Business Logic Error, not a connection problem
                           self.gui.show_popup('error-traceback',{
                                'title': error.data.message,
                                'body':  error.data.debug
                           });
                        }
                    });
                }

                var params = {
                    model: 'pos.session',
                    method: 'cash_statement_ids',
                    args: [self.pos.pos_session.id,statement_ids]
                }
                rpc.query(params).then(function(results){
                
                });

                var session_data = {
                    model: 'pos.session',
                    method: 'search_read',
                    domain: [['id', '=', self.pos.pos_session.id]],
                }
                rpc.query(session_data, {async: false}).then(function(data){
                    if(data){
                        var balance_end_real = $('.balance_end_real');
                        var cash_method = self.$el.find('.journal_id');
                        // TODO: Add cash_total to Efectivo Journal id=7
                        var real_s = [];
                        _.each(balance_end_real, function(balance){
                            real_s.push(parseFloat($(balance).val().replace('$','')));
                        });
                        var sum_real = _.reduce(real_s, function(n, num){return n + num}, 0.0);

                        _.each(data, function(value){
                            $("#open_bal").text(self.format_currency(value.cash_register_balance_start));
                            $("#transaction").text(self.format_currency(self.sum_t));
                            $("#theo_close_bal").text(self.format_currency(self.teorical_val));
                            $("#real_close_bal").text(self.format_currency(sum_real));
                            $("#differ").text(self.format_currency(sum_real - self.teorical_val));
                            $('.button.close_session').show();
                            //$("#open_bal").text(self.format_currency(value.cash_register_balance_start));
                        });
                    }
                });
            });
            this.$('.print_report_x').click(function(e){
                var pos_session_id = [self.pos.pos_session.id];
        		self.pos.chrome.do_action('flexibite_com_advance.pos_x_report',{additional_context:{
                    active_ids:pos_session_id,
                }}).fail(function(){
                	self.pos.db.notification('danger',"Connection lost");
                });
            });

            this.$('.button.close_session').click(function() {
                self.gui.close_popup();
                var params = {
                    model: 'pos.session',
                    method: 'custom_close_pos_session',
                    args:[self.pos.pos_session.id]
                }
                rpc.query(params, {async: false}).then(function(res){
                    if(res){
                        var pos_session_id = [self.pos.pos_session.id];
                        self.pos.chrome.do_action('flexibite_com_advance.pos_x_report',{
                            additional_context:{
                                active_ids:pos_session_id,
                            }
                        });
                        var cashier = self.pos.get_cashier() || self.pos.user;
                        if(cashier.login_with_pos_screen){
                            setTimeout(function(){
                                framework.redirect('/web/session/logout');
                            }, 5000);
                        }else{
                            self.pos.gui.close();
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
            });
            this.$('.button.cancel').click(function() {
                self.gui.close_popup();
            });
        },
        renderElement: function() {
            var self = this;
            this._super();
            var selectedOrder = self.pos.get_order();
            var cash_line_ids = self.pos.config.default_cashbox_lines_ids
            if(cash_line_ids && cash_line_ids.length > 0){
                _.each(cash_line_ids,function(id){
                    var cash_line = self.pos.db.cash_box_line_by_id[id];
                    if (cash_line.is_coin){
                        var table_row = "<tr id='cashcontrol_row'>" +
                        "<td><input type='text'  class='cashcontrol_td coin' id='value' value='"+cash_line.coin_value+"' /></td>" + "<span id='errmsg'/>"+
                        "<td><input type='text' class='cashcontrol_td no_of_coin' id='no_of_values' value='"+cash_line.number+"' /></td>" +
                        "<td><input type='text' class='cashcontrol_td subtotal' id='subtotal' disabled='true' value='"+cash_line.subtotal+"' /></td>" +
                        "<td id='delete_row'><span class='fa fa-trash-o'></span></td>" +
                        "</tr>";
                        $('#cashbox_data_table.coins tbody').append(table_row);
                    }
                    if(!cash_line.is_coin){
                        var table_row = "<tr id='cashcontrol_row'>" +
                        "<td><input type='text'  class='cashcontrol_td coin' id='value' value='"+cash_line.coin_value+"' /></td>" + "<span id='errmsg'/>"+
                        "<td><input type='text' class='cashcontrol_td no_of_coin' id='no_of_values' value='"+cash_line.number+"' /></td>" +
                        "<td><input type='text' class='cashcontrol_td subtotal' id='subtotal' disabled='true' value='"+cash_line.subtotal+"' /></td>" +
                        "<td id='delete_row'><span class='fa fa-trash-o'></span></td>" +
                        "</tr>";
                        $('#cashbox_data_table.cash tbody').append(table_row);
                    }
                });
            } else{
                var table_row = "<tr id='cashcontrol_row'>" +
                "<td><input type='text'  class='cashcontrol_td coin' id='value' value='0.00' /></td>" + "<span id='errmsg'/>"+
                "<td><input type='text' class='cashcontrol_td no_of_coin' id='no_of_values' value='0.00' /></td>" +
                "<td><input type='text' class='cashcontrol_td subtotal' id='subtotal' disabled='true' value='0.00' /></td>" +
                "<td id='delete_row'><span class='fa fa-trash-o'></span></td>" +
                "</tr>";
                $('#cashbox_data_table tbody').append(table_row);
            }
            
            $('#add_new_item').click(function(){
                $('#cashbox_data_table tbody').append(table_row);
            });
            $('#cashbox_data_table tbody').on('click', 'tr#cashcontrol_row td#delete_row',function(){
                $(this).parent().remove();
                self.compute_subtotal();
            });
            $('#cashbox_data_table tbody').on('change focusout', 'tr#cashcontrol_row td',function(){
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
                _.each($('#cashcontrol_row td #subtotal'), function(input){
                    if(Number(input.value) && Number(input.value) > 0){
                        subtotal += Number(input.value);
                    }
                });
                $('.subtotal_end').text(self.format_currency(subtotal));
            }
        }
    });
    gui.define_popup({name:'cash_control', widget: CashControlWizardPopup});

    //    Product Summary Report
    var ProductSummaryReportPopupWizard = PopupWidget.extend({
        template: 'ProductSummaryReportPopupWizard',
        show: function(options){
            options = options || {};
            this._super(options);
            var self = this;
            self.pos.signature = false;
            $('input#start_date').focus();
            var no_of_report = this.pos.config.no_of_copy_receipt;
            $('input#no_of_summary').val(no_of_report);
            var today_date = new Date().toISOString().split('T')[0];
            var date = new Date();
            var firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
            var first_date_of_month = firstDay.toISOString().split('T')[0];
            if(this.pos.config.product_summary_month_date){
                $('input#start_date').val(first_date_of_month);
                $('input#end_date').val(today_date);
            }
            $("#start_date").change(function() {
                if($("#start_date").val() != ""){
                     $('#start_date').css('border','');
                }
            });
            $("#end_date").change(function() {
                if($("#end_date").val() != ""){
                    $('#end_date').css('border','');
                }
            });
            if(no_of_report <= 0){
                $('input#no_of_summary').val(1);
            } else{
                $('input#no_of_summary').val(no_of_report);
            }
            $("#no_of_summary").change(function() {
                if($("#no_of_summary").val() != ""){
                    $('#no_of_summary').css('border','');
                }
            });
            if(this.pos.config.signature){
                self.pos.signature = true;
            }
        },
        click_confirm: function(){
            var self = this;
            var from_date = this.$('input#start_date').val();
            var to_date = this.$('input#end_date').val();
            var no_of_copies = this.$('input#no_of_summary').val();
            var order = this.pos.get_order();
            var today_date = new Date().toISOString().split('T')[0];
            var report_value = [];
            self.pos.from_date = from_date;
            self.pos.to_date = to_date;
            if(no_of_copies <= 0){
                this.$('#no_of_summary').css('border','1px solid red');
                 return;
            }
            $("input:checked").each(function () {
                var id = $(this).attr("id");
                report_value.push(id);
            });
            if(from_date == "" && to_date == "" || from_date != "" && to_date == "" || from_date == "" && to_date != "" ){
                if(from_date == ""){
                    $('#start_date').css('border','1px solid red');
                }
                if(to_date == ""){
                    $('#end_date').css('border','1px solid red');
                }
                return;
            } else if(from_date > to_date){
                alert("Start date should not be greater than end date");
            } else{
                var val = {
                    'start_date':from_date,
                    'end_date':to_date,
                    'summary': report_value
                }
                var params = {
                    model: 'pos.order',
                    method: 'product_summary_report',
                    args: [val],
                }
                rpc.query(params, {async: false}).then(function(res){
                    if(res){
                        order.set_order_summary_report_mode(true);
                        if(Object.keys(res['category_summary']).length == 0 && Object.keys(res['product_summary']).length == 0 &&
                            Object.keys(res['location_summary']).length == 0 && Object.keys(res['payment_summary']).length == 0){
                            order.set_order_summary_report_mode(false);
                            alert("No records found!");
                        } else{
                            self.pos.product_total_qty = 0.0;
                            self.pos.category_total_qty = 0.0;
                            self.pos.payment_summary_total = 0.0;
                            if(res['product_summary']){
                                _.each(res['product_summary'], function(value,key){
                                        self.pos.product_total_qty += value;
                                    });
                            }
                            if(res['category_summary']){
                                _.each(res['category_summary'], function(value,key) {
                                        self.pos.category_total_qty += value;
                                    });
                            }
                            if(res['payment_summary']){
                                _.each(res['payment_summary'], function(value,key) {
                                        self.pos.payment_summary_total += value;
                                    });
                            }
                        order.set_product_summary_report(res);
                        var product_summary_key = Object.keys(order.get_product_summary_report()['product_summary']);
                        if(product_summary_key.length == 0){
                            var product_summary_data = false;
                        } else {
                            var product_summary_data = order.get_product_summary_report()['product_summary'];
                        }
                        var category_summary_key = Object.keys(order.get_product_summary_report()['category_summary']);
                        if(category_summary_key.length == 0){
                            var category_summary_data = false;
                        } else {
                            var category_summary_data = order.get_product_summary_report()['category_summary'];
                        }
                        var payment_summary_key = Object.keys(order.get_product_summary_report()['payment_summary']);
                        if(payment_summary_key.length == 0){
                        var payment_summary_data = false;
                        } else {
                            var payment_summary_data = order.get_product_summary_report()['payment_summary'];
                        }
                        var location_summary_key = Object.keys(order.get_product_summary_report()['location_summary']);
                        if(location_summary_key.length == 0){
                            var location_summary_data = false;
                        } else {
                            var location_summary_data = order.get_product_summary_report()['location_summary'];
                        }
                        if (self.pos.config.iface_print_via_proxy) {
                            var receipt = "";
                            for (var step = 0; step < no_of_copies; step++) {
                                receipt = QWeb.render('ProductSummaryReportXmlReceipt', {
                                    widget: self,
                                    pos: self.pos,
                                    order: order,
                                    receipt: order.export_for_printing(),
                                    product_details: product_summary_data,
                                    category_details:category_summary_data,
                                    payment_details: payment_summary_data,
                                    location_details:location_summary_data,
                                });
                                self.pos.proxy.print_receipt(receipt);
                            }
                        } else{
                            self.gui.show_screen('receipt');
                            }
                        }
                    }
                });
            }
        },
    });
    gui.define_popup({name:'product_summary_report_wizard', widget: ProductSummaryReportPopupWizard});

    //Order Summary Report
    var OrderSummaryPopupWidget = PopupWidget.extend({
        template: 'OrderSummaryPopupWidget',
        show: function(options){
            options = options || {};
            this._super(options);
            $('input#start_date').focus();
            var self = this;
            var today_date = new Date().toISOString().split('T')[0];
            self.pos.signature = false;
            if (self.pos.config.order_summary_signature){
                self.pos.signature = true;
            }
            var date = new Date();
            var firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
            var first_date = firstDay.toISOString().split('T')[0];
            var no_of_report = this.pos.config.order_summary_no_of_copies;
            if(no_of_report <= 0){
                $('input#no_of_copies').val(1);
            }else{
                $('input#no_of_copies').val(no_of_report);
            }
            if(this.pos.config.order_summary_current_month){
                $('input#start_date').val(first_date);
                $('input#end_date').val(today_date);
            }
        },
        click_confirm: function(){
            var self = this;
            var value = {};
            var order = this.pos.get_order();
            var num = $('input#no_of_copies').val()
            self.pos.from_date = this.$('input#start_date').val();
            self.pos.to_date = this.$('input#end_date').val();
            var today_date = new Date().toISOString().split('T')[0];
            var state = states.value;
            var custom_receipt = true;
            var report_list = [];
            var client = this.pos.get_client();
            $("input:checked").each(function () {
                var id = $(this).attr("id");
                report_list.push(id);
            });
            if($('input#no_of_copies').val() <= 0){
                $('input#no_of_copies').css('border','1px solid red');
                return;
            }
            if(self.pos.from_date == "" && self.pos.to_date == "" || self.pos.from_date != "" && self.pos.to_date == "" || self.pos.from_date == "" && self.pos.to_date != "" ){
                if(self.pos.from_date == ""){
                    $('#start_date').css('border','1px solid red');
                }
                if(self.pos.to_date == ""){
                    $('#end_date').css('border','1px solid red');
                }
                return;
            } else if(self.pos.from_date > self.pos.to_date) {
                alert("End date must be greater");
                return;
            } else{
                value = {
                    'start_date' : self.pos.from_date,
                    'end_date' : self.pos.to_date,
                    'state' : state,
                    'summary' :report_list
                };
                var params = {
                    model : 'pos.order',
                    method : 'order_summary_report',
                    args : [value],
                }
                rpc.query(params,{async:false}).then(function(res){
                    self.pos.state = false;
                    if(res['state']){
                        self.pos.state = true
                    }
                    if(res){
                        order.set_receipt(custom_receipt);
                        if(Object.keys(res['category_report']).length == 0 && Object.keys(res['order_report']).length == 0 &&
                                Object.keys(res['payment_report']).length == 0){
                                order.set_receipt(false);
                                alert("No records found!");
                        } else{
                            self.pos.total_categ_amount = 0.00;
                            self.pos.total_amount = 0.00;
                            if(res['category_report']){
                                if(self.pos.state){
                                    _.each(res['category_report'], function(value,key) {
                                        self.pos.total_categ_amount += value[1];
                                    });
                                }
                            }
                            if(res['payment_report']){
                                if(self.pos.state){
                                    _.each(res['payment_report'], function(value,key) {
                                        self.pos.total_amount += value;
                                    });
                                }
                            }
                            order.set_order_list(res);
                            if(order.get_receipt()) {
                                var category_data = '';
                                var order_data = '';
                                var payment_data = '';
                                if(Object.keys(order.get_order_list().order_report).length == 0 ){
                                    order_data = false;
                                }else{
                                    order_data = order.get_order_list()['order_report']
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
                                var receipt = '';
                                if(self.pos.config.iface_print_via_proxy){
                                    for (var i=0;i < num;i++) {
                                        receipt = QWeb.render('OrderXmlReceipt', {
                                            widget: self,
                                            pos: self.pos,
                                            order: order,
                                            receipt: order.export_for_printing(),
                                            order_report : order_data,
                                            category_report : category_data,
                                            payment_report : payment_data,
                                        });
                                    }
                                    self.pos.proxy.print_receipt(receipt);
                                } else{
                                    self.gui.show_screen('receipt')
                                }
                            }
                        }
                    }
                });
            }
        },
    });
    gui.define_popup({name:'order_summary_popup',widget: OrderSummaryPopupWidget});


    //    Payment Summary Report
    var PaymentSummaryReportPopupWizard = PopupWidget.extend({
        template: 'PaymentSummaryReportPopupWizard',
        show: function(options){
            options = options || {};
            this._super(options);
            var self = this;
            var today_date = new Date().toISOString().split('T')[0];
            var date = new Date();
            var firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
            var first_date_of_month = firstDay.toISOString().split('T')[0];
            if(this.pos.config.current_month_date){
                $('input#start_date').val(first_date_of_month);
                $('input#end_date').val(today_date);
            }
            $("#start_date").change(function() {
                if($("#start_date").val()){
                     $('#start_date').css('border','');
                }
            });
            $("#end_date").change(function() {
                if($("#end_date").val()){
                    $('#end_date').css('border','');
                }
            });
            $('input#start_date').focus();
        },
        click_confirm: function(){
            var self = this;
            var order = this.pos.get_order();
            var from_date = this.$('input#start_date').val();
            var to_date = this.$('input#end_date').val();
            var today_date = new Date().toISOString().split('T')[0];
            var data = dropdown_data.value;
            order.set_sales_summary_mode(true);
            var pop_start_date = from_date.split('-');
            self.pos.from_date  = pop_start_date[2] + '-' + pop_start_date[1] + '-' + pop_start_date[0];
            var pop_end_date = to_date.split('-');
            self.pos.to_date  = pop_end_date[2] + '-' + pop_end_date[1] + '-' + pop_end_date[0];
            if(from_date == "" && to_date == "" || from_date != "" && to_date == "" || from_date == "" && to_date != "" ){
                if(!from_date){
                    $('#start_date').css('border','1px solid red');
                }
                if(!to_date){
                    $('#end_date').css('border','1px solid red');
                }
                return;
            } else if(from_date > to_date){
                alert("Start date should not be greater than end date");
            } else{
                var val = {
                    'start_date':from_date,
                    'end_date':to_date,
                    'summary': data
                }
                var params = {
                    model: 'pos.order',
                    method: 'payment_summary_report',
                    args: [val],
                }
                rpc.query(params, {async: false}).then(function(res){
                    if(res){
                        if(Object.keys(res['journal_details']).length == 0 && Object.keys(res['salesmen_details']).length == 0){
                            order.set_sales_summary_mode(false);
                            alert("No records found!");
                        } else{
                            order.set_sales_summary_vals(res);
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
                            if (self.pos.config.iface_print_via_proxy) {
                                var receipt = "";
                                receipt = QWeb.render('PaymentSummaryReportXmlReceipt', {
                                    widget: self,
                                    pos: self.pos,
                                    order: order,
                                    receipt: order.export_for_printing(),
                                    journal_details: journal_summary_data,
                                    salesmen_details: sales_summary_data,
                                    total_summary : total_summary_data
                                });
                               self.pos.proxy.print_receipt(receipt);
                            } else{
                                self.gui.show_screen('receipt');
                           }
                        }
                    }
                });
            }
        },
    });
    gui.define_popup({name:'payment_summary_report_wizard', widget: PaymentSummaryReportPopupWizard});

    // Print Audit Report
    var ReportPopupWidget = PopupWidget.extend({
        template: 'ReportPopupWidget',
        events: _.extend({}, PopupWidget.prototype.events, {
            'click .report_pdf.session': 'session_report_pdf',
            'click .report_thermal.session': 'session_report_thermal',
            'click .report_pdf.location': 'location_report_pdf',
            'click .report_thermal.location': 'location_report_thermal',
            'click .tablinks':'tablinks',
        }),
        show: function(options){
            options = options || {};
            this._super(options);
            this.enable_thermal_print = this.pos.config.iface_print_via_proxy || false;
            this.renderElement();
        },
        tablinks: function(event){
            var cityName = $(event.currentTarget).attr('value');
            var i, tabcontent, tablinks;
            tabcontent = document.getElementsByClassName("tabcontent");
            for (i = 0; i < tabcontent.length; i++) {
                tabcontent[i].style.display = "none";
            }
            tablinks = document.getElementsByClassName("tablinks");
            for (i = 0; i < tablinks.length; i++) {
                tablinks[i].className = tablinks[i].className.replace(" active", "");
            }
            document.getElementById(cityName).style.display = "block";
            event.currentTarget.className += " active";
        },
        session_report_pdf: function(e){
            var self = this;
            var session_id = $(e.currentTarget).data('id');
            self.pos.chrome.do_action('flexibite_com_advance.report_pos_inventory_session_pdf_front',{additional_context:{
                active_ids:[session_id],
            }}).fail(function(){
                alert("Connection lost");
            });
        },
        session_report_thermal: function(e){
            var self = this;
            var session_id = $(e.currentTarget).data('id');
            var report_name = "flexibite_com_advance.front_inventory_session_thermal_report_template";
            var params = {
                model: 'ir.actions.report',
                method: 'get_html_report',
                args: [session_id, report_name],
            }
            rpc.query(params, {async: false})
            .then(function(report_html){
                if(report_html && report_html[0]){
                    self.pos.proxy.print_receipt(report_html[0]);
                }
            });
        },
        location_report_pdf: function(e){
            var self = this;
            var location_id = $(e.currentTarget).data('id');
            self.pos.chrome.do_action('flexibite_com_advance.report_pos_inventory_location_pdf_front',{additional_context:{
                active_ids:[location_id],
            }}).fail(function(){
                alert("Connection lost");
            });
        },
        location_report_thermal: function(e){
            var self = this;
            var location_id = $(e.currentTarget).data('id');
            var report_name = "flexibite_com_advance.front_inventory_location_thermal_report_template";
            var params = {
                model: 'ir.actions.report',
                method: 'get_html_report',
                args: [location_id, report_name],
            }
            rpc.query(params, {async: false})
            .then(function(report_html){
                if(report_html && report_html[0]){
                    self.pos.proxy.print_receipt(report_html[0]);
                }
            });
        },
    });
    gui.define_popup({name:'report_popup', widget: ReportPopupWidget});

    var create_po_popup = PopupWidget.extend({
        template: 'CreatePurchaseOrderPopupWizard',
        show: function(options){
            options = options || {};
            this._super(options);
            var self = this;
            self.renderElement()
            self.list_products = options.list_products;
            var supplier_list = self.pos.db.get_supplier_list();
//	        $("#loading").hide();
            $('#select_supplier').keypress(function(e){
                $('#select_supplier').autocomplete({
                    source:supplier_list,
                    select: function(event, ui) {
                        self.supplier_id = ui.item.id;
                    },
                });
            });
            $('.product-detail-list').on('click', 'tr.product-line td#delete_row',function(){
                $(this).parent().remove();
            });
        },
        click_confirm: function(){
            var self = this;
            var product_detail = {};
            var supplier = $('#select_supplier').val();
            $('.select_qty_product').map(function(ev){
                var product_id = $(this).attr('data-id');
                var product_qty = $(this).val();
                var product = self.pos.db.get_product_by_id(Number(product_id));
                product_detail[product_id] = product_qty;
            });
            var send_mail = $("#create_po_mail").val();
            var val = {
                'supplier_id':self.supplier_id,
                'send_mail':send_mail,
                'product_detail': product_detail
            }
            var params = {
                model: 'purchase.order',
                method: 'create_po',
                args: [val],
            }
            $('.freeze_screen').addClass("active_state");
//            $('.loading').css('display','block');
            rpc.query(params, {async: false}).then(function(result){
                if(result && result[0] && result[0]){
                    $('.freeze_screen').removeClass("active_state");
//                    $('.loading').css('display','none');
                    self.gui.close_popup();
                    var url = window.location.origin + '#id=' + result[0] + '&view_type=form&model=purchase.order';
                    self.pos.gui.show_popup('purchase_order_created', {'url':url, 'name':result[1]});
                }
            });
        },
    });
    gui.define_popup({name:'create_purchase_order_popup', widget: create_po_popup});

    var PurchaseOrderPopupWidget = PopupWidget.extend({
        template: 'PurchaseOrderPopupWidget',
        click_confirm: function(){
            var self = this;
            this.gui.close_popup();
            self.gui.show_screen('products');
        },
    });
    gui.define_popup({name:'purchase_order_created', widget: PurchaseOrderPopupWidget});


    var POSComboProductPopup = PopupWidget.extend({
        template: 'POSComboProductPopup',
        events: _.extend({}, PopupWidget.prototype.events, {
            'click .collaps_div': 'collaps_div',
            'click .product.selective_product': 'select_product',
        }),
        show: function(options){
            var self = this;
            this._super(options);
            this.product = options.product || false;
            this.combo_product_info = options.combo_product_info || false;
            var combo_products_details = [];
            this.new_combo_products_details = [];
            this.scroll_position = 0;
            this.product.product_combo_ids.map(function(id){
                var record = _.find(self.pos.product_combo, function(data){
                    return data.id === id;
                });
                combo_products_details.push(record);
            });
            combo_products_details.map(function(combo_line){
                var details = [];
                if(combo_line.product_ids.length > 0){
                    combo_line.product_ids.map(function(product_id){
                        if(combo_line.require){
                            var data = {
                                'no_of_items':combo_line.no_of_items,
                                'product_id':product_id,
                                'category_id':combo_line.pos_category_id[0] || false,
                                'used_time':combo_line.no_of_items,
                            }
                            details.push(data);
                        }else{
                            var data = {
                                'no_of_items':combo_line.no_of_items,
                                'product_id':product_id,
                                'category_id':combo_line.pos_category_id[0] || false,
                                'used_time':0
                            }
                            if(self.combo_product_info){
                                self.combo_product_info.map(function(line){
                                    if(combo_line.id == line.id && line.product.id == product_id){
                                        data['used_time'] =  line.qty;
                                    }
                                });
                            }
                            details.push(data);
                        }
                    });
                    self.new_combo_products_details.push({
                        'id':combo_line.id,
                        'no_of_items':combo_line.no_of_items,
                        'pos_category_id':combo_line.pos_category_id,
                        'product_details':details,
                        'product_ids':combo_line.product_ids,
                        'require':combo_line.require,
                    });
                }
            });
            this.renderElement();
        },
        collaps_div: function(event){
            if($(event.currentTarget).hasClass('fix_products')){
                $('.combo_header_body').slideToggle('500');
                $(event.currentTarget).find('i').toggleClass('fa-angle-down fa-angle-up');
            }else if($(event.currentTarget).hasClass('selective_products')){
                $('.combo_header2_body').slideToggle('500');
                $(event.currentTarget).find('i').toggleClass('fa-angle-down fa-angle-up');
            }
        },
        select_product: function(event){
            var self = this;
            var $el = $(event.currentTarget);
            var product_id = Number($el.data('product-id'));
            var category_id = Number($el.data('categ-id'));
            var line_id = Number($el.data('line-id'));
            self.scroll_position = Number(self.$el.find('.combo_header2_body').scrollTop()) || 0;
            if($(event.target).hasClass('fa-times') || $(event.target).hasClass('product-remove')){
                if($el.hasClass('selected')){
                    self.new_combo_products_details.map(function(combo_line){
                        if(!combo_line.require){
                            if(combo_line.id == line_id && (_.contains(combo_line.product_ids, product_id) || (combo_line.pos_category_id[0] == category_id))){
//                			if(combo_line.id == line_id && combo_line.pos_category_id[0] == category_id && (_.contains(combo_line.product_ids, product_id))){
                                combo_line.product_details.map(function(product_detail){
                                    if(product_detail.product_id == product_id){
                                        product_detail.used_time = 0;
                                    }
                                });
                            }
                        }
                    });
                }
            }else{
                self.new_combo_products_details.map(function(combo_line){
                    if(!combo_line.require){
                        if(combo_line.id == line_id && (_.contains(combo_line.product_ids, product_id) || (combo_line.pos_category_id[0] == category_id))){
//            			if(combo_line.id == line_id && combo_line.pos_category_id[0] == category_id && (_.contains(combo_line.product_ids, product_id))){
                            var added_item = 0;
                            combo_line.product_details.map(function(product_detail){
                                added_item += product_detail.used_time;
                            });
                            combo_line.product_details.map(function(product_detail){
                                if(product_detail.product_id == product_id){
                                    if(product_detail.no_of_items > product_detail.used_time && product_detail.no_of_items > added_item){
                                        product_detail.used_time += 1;
                                    }
                                }
                            });
                        }
                    }
                });
            }
            self.renderElement();
        },
        click_confirm: function(){
            var self = this;
            var order = self.pos.get_order();
//            var total_amount = 0;
            var products_info = [];
            var pricelist = self.pos.gui.screen_instances.products.product_list_widget._get_active_pricelist();
            self.new_combo_products_details.map(function(combo_line){
                if(combo_line.product_details.length > 0){
                    combo_line.product_details.map(function(prod_detail){
                        if(prod_detail.used_time){
                            var product = self.pos.db.get_product_by_id(prod_detail.product_id);
                            if(product){
//                				total_amount = self.product.get_price(pricelist, 1);
                                products_info.push({
                                    "product":{
                                        'display_name':product.display_name,
                                        'id':product.id,
                                    },
                                    'qty':prod_detail.used_time,
                                    'price':product.get_price(pricelist, 1),
                                    'id':combo_line.id,
                                });
                            }
                        }
                    });
                }
            });
            var selected_line = order.get_selected_orderline();
            if(products_info.length > 0){
                if(selected_line){
//            		selected_line.set_unit_price(total_amount);
                    selected_line.set_combo_prod_info(products_info);
                    // Code Change for Print Combo in Kitchen Screen
                    var combo_order_line = selected_line;
                    order.remove_orderline(selected_line);
                    var combo_product = self.pos.db.get_product_by_id(Number(combo_order_line.product.id));
                    order.add_product(combo_product, {
                        quantity: combo_order_line.quantity,
                    });
                    var new_line = order.get_selected_orderline();
                    new_line.set_combo_prod_info(combo_order_line.combo_prod_info);
                }else{
                    alert("Selected line not found!");
                }
            }else{
                if(selected_line && !selected_line.get_combo_prod_info()){
                    order.remove_orderline(selected_line);
                }
            }
            order.mirror_image_data();
            self.gui.close_popup();
        },
        click_cancel: function(){
            var order = this.pos.get_order();
            var selected_line = order.get_selected_orderline();
            if(selected_line && !selected_line.get_combo_prod_info()){
                order.remove_orderline(selected_line);
            }
            this.gui.close_popup();
        },
        renderElement: function(){
            this._super();
            this.$el.find('.combo_header2_body').scrollTop(this.scroll_position);
        },
    });
    gui.define_popup({name:'combo_product_popup', widget: POSComboProductPopup});


//    credit
    var PrintCashInOutStatmentPopup = PopupWidget.extend({
        template: 'PrintCashInOutStatmentPopup',
        show: function(options){
            var self = this;
            self._super(options);
            $('.start-date input').focus();
        },
        click_confirm: function(){
            var self = this;
            var order = self.pos.get_order();
            var start_date = $('.start-date input').val();
            var end_date = $('.end-date input').val();
            var customer_id = self.pos.gui.screen_instances.customercreditlistscreen.get_cust_id()
            customer_id = customer_id ? customer_id : self.pos.get_client().id;
            var partner = self.pos.db.get_partner_by_id(customer_id);
            if(partner.parent_id){
                partner = self.pos.db.get_partner_by_id(partner.parent_id[0]);
            } else{
                partner = self.pos.db.get_partner_by_id(customer_id)
            }
            var account_id = partner.property_account_receivable_id;
            if(start_date > end_date){
                alert("Start date should not be greater than end date");
                return
            }
            if(start_date && end_date){
                var params = {
                    model: "account.move.line",
                    method: "search_read",
                    domain: [['date_maturity', '>=', start_date  + " 00:00:00"],['date_maturity', '<=', end_date + " 23:59:59"],
                             ['partner_id','=',partner.id],['account_id','=',account_id[0]]],
                }
                rpc.query(params, {async: false})
                .then(function(vals){
                    if(vals && vals[0]){
                        if(partner && vals.length > 0){
                            self.gui.show_screen('receipt');
                            partner = self.pos.db.get_partner_by_id(customer_id);
                            $('.pos-receipt-container', this.$el).html(QWeb.render('AddedCreditStatement',{
                                widget: self,
                                order: order,
                                move_line:vals,
                                partner:partner
                            }));
                        } else{
                            return
                        }
                    }else{
                        return self.pos.db.notification('danger','Records not found!');
                    }
                });
            }
            else if(start_date == "" && end_date !== ""){
                $('.start-date input').css({'border-style': 'solid','border-width': '1px',
                    'border-color': 'rgb(255, 0, 0)'});
                $('.end-date input').css({'border-color': 'rgb(224,224,224)'});
            }else if(end_date == "" && start_date !== ""){
                $('.end-date input').css({'border-style': 'solid','border-width': '1px',
                    'border-color': 'rgb(255, 0, 0)'});
                $('.start-date input').css({'border-color': 'rgb(224,224,224)'});
            }else{
                $('.start-date input, .end-date input').css({'border-style':'solid', 'border-width': '1px',
                    'border-color': 'rgb(255, 0, 0)'});
            }
        },
    });
    gui.define_popup({name:'cash_inout_statement_popup', widget: PrintCashInOutStatmentPopup});

    var AddMoneyToCreditPopup = PopupWidget.extend({
        template: 'AddMoneyToCreditPopup',
        show: function(options){
            var self = this;
            this.client = options.new_client ? options.new_client : false;
            var cust_due = this.pos.get_customer_due(this.client);
            this.cust_due = cust_due.toFixed(2);
            this._super();
            $('#amount-to-be-added').focus();
            $('.pay_amount .chk_pay_due').click(function(){
                if (!$(this).is(':checked')) {
                    $("#amount-to-be-added").val("");
                }else{
                    $("#amount-to-be-added").val(self.cust_due);
                }
            });
        },
        click_confirm: function(){
            var self = this;
            var order = this.pos.get_order();
            if($('#amount-to-be-added').val() == ""){
                alert(_t('Please, enter amount!'));
                return;
            }
            var get_journal_id = Number($('.select-journal').val());
            var amt_due = self.cust_due;
            var amount = Number($('#amount-to-be-added').val());
            var pos_session_id = self.pos.pos_session.name;
            var partner_id = Number($('.client-line.highlight').attr('-id')) || Number($('.client-line.lowlight').attr('data-id'));
            var client = self.pos.get_order().get_client()
            partner_id = partner_id ? partner_id : client.id;
            var cashier_id = self.pos.get_cashier().id;
            this.pay_due = $(".chk_pay_due").prop('checked');
            var params = {
                model: 'account.payment',
                method: "payment",
                args: [get_journal_id, amount, pos_session_id, partner_id, cashier_id, this.pay_due],
//                args: [get_journal_id, amount, pos_session_id, partner_id, cashier_id, this.pay_due],
            }
            rpc.query(params, {async: false}).then(function(vals){
                if(vals){
                    if(vals.affected_order && vals.affected_order[0]){
                        if(self.pos.get('pos_order_list') && self.pos.get('pos_order_list').length > 0){
                            _.each(self.pos.get('pos_order_list'),function(order){
                                _.each(vals.affected_order,function(new_order){
                                    if(order.id == new_order[0].id){
                                        if(new_order[0].amount_total && new_order[0].amount_paid){
                                            order.amount_due = new_order[0].amount_total - new_order[0].amount_paid;
                                        }
                                    }
                                });
                            });
                        }
                    }
                    var partner = self.pos.db.get_partner_by_id(partner_id);
                    partner.remaining_credit_amount = vals.credit_bal;
                    self.gui.show_screen('receipt');
                    $('.pos-receipt-container', this.$el).html(QWeb.render('AddedCreditReceipt',{
                        widget: self,
                        order: order,
                        get_journal_id: get_journal_id,
                        amount: vals.credit_bal,
                        amt_due: vals.amount_due,
                        pay_due: self.pay_due,
                        partner_id: partner_id,
                    }));
                }
            });
        },
    });
    gui.define_popup({name:'AddMoneyToCreditPopup', widget: AddMoneyToCreditPopup});
    
    var PayDebutPopup = PopupWidget.extend({
        template: 'PayDebutPopup',
        show: function(options){
            var self = this;
            var partner = self.pos.get_client();
            if (partner && partner.id == 36){
                self.gui.show_screen('clientlist');
                return;
            }
            this.journal_ids = [];
            /*
            /// Descomentar para validar el filtro de los metodos de pago

            for (var i = 0; i<this.pos.cashregisters.length; i++){
                var cashregister = this.pos.cashregisters[i];
                this.journal_ids.push(cashregister.journal_id);
            }

            console.log(this.journal_ids);
            */
            /*
            rpc.query({
                model: 'account.journal',
                method: 'search_read',
                domain: ['id', 'in', []]
            }).then(function(data){
                
            });
            */
            
            this.cust_due = this.pos.get_customer_due(partner).toFixed(2);
            this._super();
            $('#amount-to-be-pay').focus();
        },
        click_confirm: function(){
            var self = this;
            var order = this.pos.get_order();
            var amount = $('#amount-to-be-pay').val();
            var confirm_amount = $('#re-amount-to-be-pay').val();
            
            if(!amount){
                alert(_t('Pof favor, Ingresa un monto!'));
                return;
            }

            if(amount <= 0){
                self.pos.db.notification('danger',"Ingresa un monto válido.!");
                return;
            }
            
            if (confirm_amount <= 0){
                self.pos.db.notification('danger',"Confirmar importe: Ingresa un monto válido.!");
                return;
            }

            if (amount !== confirm_amount){
                self.pos.db.notification('danger', "Los importes no coinciden!");
                return;
            }
            
            var product_debit = self.pos.db.get_product_by_id(3887);
            var options = {
                quantity: 1,
                lst_price: amount,
                price: amount
            }
            order.add_product(product_debit, options);
            var get_journal_id = Number($('#select-journal :selected').val());
            var amt_due = self.cust_due;
            var amount = Number(amount);
            var pos_session_id = self.pos.pos_session.name;
            var partner_id = Number($('.client-line.highlight').attr('-id')) || Number($('.client-line.lowlight').attr('data-id'));
            var client = self.pos.get_order().get_client();
            partner_id = partner_id ? partner_id : client.id;
            var cashier_id = self.pos.get_cashier().id;
            var params = {
                model: 'account.payment',
                method: "increase_customer_debit",
                args: [get_journal_id, amount, pos_session_id, partner_id, cashier_id, true],
            }
            rpc.query(params, {async: false}).then(function(response)
            {
                self.pos.db.notification('success',"Pago de abono aceptado!");
                self.gui.close_popup();
                var partner = self.pos.get_client();                
                
                if(response.debit_limit)
                {
                    partner.debit_limit = response.debit_limit;
                    partner.remaining_debit_amount = response.remaining_debit_amount;
                    self.pos.get_order().set_client(partner);
                    var partner = self.pos.get_client();
                }
                /**
                 * 
                 * Validate models module to change order amount
                 */
                
                //order.set_amount_debit(amount);
                //self.gui.show_screen('payment');
                self.pos.push_order(order);
                self.pos.gui.show_screen('receipt');
                var o = self.pos.get_order();
                var params = {
                    model: 'pos.order',
                    method: 'make_payment_debit',
                    args: [o.id, pos_session_id]
                }
                return rpc.query(params).then(function(res){
                });

            });
        },
        renderElement: function() {
            var self = this;
            self._super();
            $('#pay_amount').click(function(){
                if (!$(this).is(':checked')) {
                    $("#amount-to-be-added").val("");
                }else{
                    $("#amount-to-be-added").val(self.cust_due)
                }
            })
        },
        export_as_JSON: function() {
            var pack_lot_ids = [];
            if (this.has_product_lot){
                this.pack_lot_lines.each(_.bind( function(item) {
                    return pack_lot_ids.push([0, 0, item.export_as_JSON()]);
                }, this));
            }
            return {
                qty: this.get_quantity(),
                price_unit: this.get_unit_price(),
                discount: this.get_discount(),
                product_id: this.get_product().id,
                tax_ids: [[6, false, _.map(this.get_applicable_taxes(), function(tax){ return tax.id; })]],
                id: this.id,
                pack_lot_ids: pack_lot_ids
            };
        },
    });
    gui.define_popup({name:'pay_debit_popup', widget: PayDebutPopup});

    var PayMealPlanPopup = PopupWidget.extend({
        template: 'PayMealPlanPopup',
        show: function(options){
            var self = this;
            var partner = self.pos.get_client();
            
            this.cust_due = this.pos.get_customer_due(partner).toFixed(2);
            this._super();
            $('#meal-amount-to-be-pay').focus();
        },
        click_confirm: function(){
            var self = this;
            var order = this.pos.get_order();
            var amount = $('#meal-amount-to-be-pay').val();
            if(!amount){
                alert(_t('Please, enter amount!'));
                return;
            }
            if(amount <= 0){
                self.pos.db.notification('danger',"Enter valid amount!");
                return;
            }
            var get_journal_id = Number($('#meal-select-journal :selected').val());
            var amt_due = self.cust_due;
            var amount = Number(amount);
            var pos_session_id = self.pos.pos_session.name;
            var partner_id = Number($('.client-line.highlight').attr('-id')) || Number($('.client-line.lowlight').attr('data-id'));
            var client = self.pos.get_order().get_client()
            partner_id = partner_id ? partner_id : client.id;
            var cashier_id = self.pos.get_cashier().id;
            var params = {
                model: 'account.payment',
                method: "increase_customer_meal_plan",
                args: [get_journal_id, amount, pos_session_id, partner_id, cashier_id, true],
            }
            rpc.query(params, {async: false}).then(function(response)
            {
                self.pos.db.notification('success',"Pago de abono aceptado!");
                self.gui.close_popup();
                var partner = self.pos.get_client();                
                
               /* if(response.debit_limit)
                {
                    partner.debit_limit = response.debit_limit;
                    partner.remaining_debit_amount = response.remaining_debit_amount;
                    self.pos.get_order().set_client(partner);
                    var partner = self.pos.get_client();
                }*/
            });
        },
        renderElement: function() {
            var self = this;
            self._super();
            $('#pay_amount').click(function(){
                if (!$(this).is(':checked')) {
                    $("#amount-to-be-added").val("");
                }else{
                    $("#amount-to-be-added").val(self.cust_due)
                }
            })
        },
        export_as_JSON: function() {
            var pack_lot_ids = [];
            if (this.has_product_lot){
                this.pack_lot_lines.each(_.bind( function(item) {
                    return pack_lot_ids.push([0, 0, item.export_as_JSON()]);
                }, this));
            }
            return {
                qty: this.get_quantity(),
                price_unit: this.get_unit_price(),
                discount: this.get_discount(),
                product_id: this.get_product().id,
                tax_ids: [[6, false, _.map(this.get_applicable_taxes(), function(tax){ return tax.id; })]],
                id: this.id,
                pack_lot_ids: pack_lot_ids
            };
        },
    });
    gui.define_popup({name:'pay_meal_plan_popup', widget: PayMealPlanPopup});

    // Internal Stock Transfer
    var InternalTransferPopupWidget = PopupWidget.extend({
        template: 'InternalTransferPopupWidget',
        show: function(options){
            options = options || {};
            var self = this;
            this.picking_types = options.stock_pick_types || [];
            this.location = options.location || [];
            this._super(options);
            this.renderElement();
            var pick_type = Number($('#pick_type').val());
            var selected_pick_type = self.pos.db.get_picking_type_by_id(pick_type);
            if(selected_pick_type && selected_pick_type.default_location_src_id[0]){
                $('#src_loc').val(selected_pick_type.default_location_src_id[0]);
            }
            if(selected_pick_type && selected_pick_type.default_location_dest_id[0]){
                $('#dest_loc').val(selected_pick_type.default_location_dest_id[0]);
            }
            $('#pick_type').change(function(){
                var pick_type = Number($(this).val());
                var selected_pick_type = self.pos.db.get_picking_type_by_id(pick_type);
                if(selected_pick_type && selected_pick_type.default_location_src_id[0]){
                    $('#src_loc').val(selected_pick_type.default_location_src_id[0]);
                }
                if(selected_pick_type && selected_pick_type.default_location_dest_id[0]){
                    $('#dest_loc').val(selected_pick_type.default_location_dest_id[0]);
                }
            });
        },
        click_confirm: function(){
            var self = this;
            var selectedOrder = this.pos.get_order();
            var currentOrderLines = selectedOrder.get_orderlines();
            var moveLines = [];
            _.each(currentOrderLines,function(item) {
               var data = {}
               var nm = item.product.default_code ? "["+ item.product.default_code +"]"+ item.product.display_name  : "";
               data['product_id'] = item.product.id;
               data['name'] = nm || item.product.display_name;
               data['product_uom_qty'] = item.get_quantity();
               data['location_id'] =  Number($('#src_loc').val());
               data['location_dest_id'] = Number($('#dest_loc').val());
               data['product_uom'] = item.product.uom_id[0];

               moveLines.push(data);
            });

            var data = {}
            data['moveLines'] = moveLines;
            data['picking_type_id'] = Number($('#pick_type').val());
            data['location_src_id'] =  Number($('#src_loc').val());
            data['location_dest_id'] = Number($('#dest_loc').val());
            data['state'] = $('#state').val();
            var params = {
                            model: 'stock.picking',
                            method: 'do_detailed_internal_transfer',
                            args: [{'data':data}]
                         }
            rpc.query(params, {async: false}).then(function(result){
                if(result && result[0] && result[0]){
                    var url = window.location.origin + '#id=' + result[0] + '&view_type=form&model=stock.picking';
                    self.pos.gui.show_popup('stock_pick', {'url':url, 'name':result[1]});
                }
            }).fail(function (type, error){
                if(error.code === 200 ){    // Business Logic Error, not a connection problem
                   self.gui.show_popup('error-traceback',{
                        'title': error.data.message,
                        'body':  error.data.debug
                   });
                }
            });
        },
    });
    gui.define_popup({name:'int_trans_popup', widget: InternalTransferPopupWidget});

    var StockPickPopupWidget = PopupWidget.extend({
        template: 'StockPickPopupWidget',
        click_confirm: function(){
            var self = this;
            var order = self.pos.get_order();
            var lines = order.get_orderlines();
            if(lines.length>0){
                for(var i=0; i<= lines.length + 1; i++){
                    _.each(lines,function(item){
                        order.remove_orderline(item);
                    });
                }
                for(var i=0; i<= lines.length + 1; i++){
                    _.each(lines,function(item){
                        order.remove_orderline(item);
                    });
                }
            }
            this.gui.close_popup();
        }
    });
    gui.define_popup({name:'stock_pick', widget: StockPickPopupWidget});

    var ChangeDeliveryUserPopupWidget = PopupWidget.extend({
        template: 'ChangeDeliveryUserPopupWidget',
        show: function(options){
            options = options || {};
            this.current_delivery_user_id = Number(options.delivery_user_id) || false;
            this.order_id = Number(options.order_id) || false;
            this.renderElement();
        },
        click_confirm: function(){
            var self = this;
            var order = self.pos.get_order();
            var change_delivery_user_id = Number($('.change_delivery_user_id').val());
            if(change_delivery_user_id){
                if(self.order_id){
                    var params = {
                        model: 'pos.order',
                        method: 'write',
                        args: [self.order_id, {'delivery_user_id':change_delivery_user_id}]
                    }
                    rpc.query(params, {async: false})
                    .then(function(result){
                        if(result){
                            self.pos.db.notification('success','Delivery user change successfully!');
                            self.pos.chrome.screens.delivery_details_screen.load_delivery_orders();
                        }else{
                            self.pos.db.notification('danger','Delivery user not change!');
                        }
                    });
                    self.gui.close_popup();
                }else{
                    self.pos.db.notification('danger','Order id not found!');
                }
            }else{
                return self.pos.db.notification('danger',"Please select delivery user!");
            }
        }
    });
    gui.define_popup({name:'change_delivery_user_popup', widget: ChangeDeliveryUserPopupWidget});

    var DeliveryPaymentPopupWidget = PopupWidget.extend({
        template: 'DeliveryPaymentPopupWidget',
        show: function(options){
            var self = this;
            options = options || {};
            self.order_id = Number(options.order_id) || false;
            self.pos_orders = options.pos_orders || [];
            self.pos_order = _.find(self.pos_orders, function(order){ return order.id === self.order_id });
            this.renderElement();
        },
        click_confirm: function(){
            var self = this;
            var order = self.pos.get_order();
            var journal_id = Number($('.payment_type').val());
            if(journal_id != 0){
                if(self.order_id){
                    var params = {
                        model: 'pos.order',
                        method: 'make_delivery_payment',
                        args: [self.order_id, journal_id,]
                    }
                    rpc.query(params, {async: false})
                    .then(function(result){
                        if(result){
                            self.pos.db.notification('success','Order delivered successful!');
                            var statements = [];
                            if(result.statement_ids.length > 0){
                                statements = self.pos.chrome.screens.delivery_details_screen.get_journal_from_order(result.statement_ids);
                            }
                            result['statements'] = statements;
                            self.pos.get_order().set_delivery_payment_data(result);
                            self.pos.gui.show_screen('receipt');
                        }else{
                            return self.pos.db.notification('danger',"Order not paid, please try again!");
                        }
                    });
                    self.gui.close_popup();
                }else{
                    return self.pos.db.notification('danger','Order id not found!');
                }
            }else{
                return self.pos.db.notification('danger',"Please select payment type!");
            }
        },
    });
    gui.define_popup({name:'delivery_payment_popup', widget: DeliveryPaymentPopupWidget});

    var MultiStorePopupWidget = PopupWidget.extend({
        template: 'MultiStorePopupWidget',
        show: function(options){
            var self = this;
            options = options || {};
            self.cashier_store = options.cashier_store;
            self._super(options);
            self.selected_id = false;
            self.renderElement();
        },
        renderElement: function(){
            var self = this;
            self._super();
            $('.store-list li').click(function(){
                var id = $(this).attr('id');
                self.selected_id = Number(id);
                if($(this).hasClass('change_location')){
                    $('.store').removeClass('change_location')
                }else {
                    $('.store').removeClass('change_location')
                    $(this).addClass('change_location');
                }
            });
        },
        click_confirm: function(){
            var self = this;
            var user_company = self.pos.get_cashier();
            self.pos.store_rec = self.pos.store_by_id[self.selected_id];
            if(self.pos.store_rec){
                var param_config = {
                    model: 'pos.config',
                    method: 'write',
                    args: [self.pos.config.id,{'stock_location_id':self.pos.store_rec.location_id[0],'multi_shop_id':self.pos.store_rec.id}],
                }
                if(self.selected_id){
                    if(self.selected_id == self.pos.pos_session.shop_id[0]){
                        return;
                    }
                    else{
                        rpc.query(param_config, {async: false}).then(function(result){
                            if(result){
                                self.pos.shop = self.pos.store_rec.location_id[1];
                                self.pos.db.notification('success',_t(self.pos.shop + ' switched successfully.'));
                                var params = {
                                    model: 'pos.session',
                                    method: 'write',
                                    args: [self.pos.pos_session.id,{'shop_id':Number(self.selected_id)}],
                                }
                                rpc.query(params, {async: false}).then(function(result){
                                if(result){
                                        self.pos.store = self.pos.store_by_id[self.selected_id];
                                    }
                                });
                                var store_manager = {
                                    model: 'pos.shop',
                                    method: 'write',
                                    args: [self.selected_id,{'store_manager':self.pos.get_cashier().id}],
                                }
                                rpc.query(store_manager, {async: false}).then(function(result){
                                if(result){
                                        self.pos.store_manager = self.pos.pos_session.user_id[0];
                                    }
                                });
                                setTimeout(function(){
                                    location.reload();
                                }, 1000);
                            } else {
                                self.pos.db.notification('error',_t('Could not switch to Shop.'));
                            }
                        }).fail(function(error){
                            if(error && error.data.message){
                                self.pos.db.notification('error',error.data.message);
                            }
                        });
                    }
                } else {
                    self.pos.db.notification('error',_t("Shop not found"));
                }
            }
            self._super();
        },
    });
    gui.define_popup({name:'multi_shop_popup', widget: MultiStorePopupWidget});

    var ReserverTablePopupWidget = PopupWidget.extend({
        template:'ReserverTablePopupWidget',
        show: function(options){
            var self = this;
            this._super(options);
            this.table = options.table || false;
            this.no_of_guest = options.no_of_guest || false;
            this.reservation_date = options.reservation_date || false;
            this.reservation_time = options.reservation_time || false;
            this.partner_id = false;
            this.reservation_duration = options.reservation_duration || "";
            this.renderElement();
            var table_name_string = ""
            _.each(options.table,function(tab_rec){
                table_name_string += tab_rec.name + ','
            })
            table_name_string = table_name_string.replace(/,\s*$/, "");
            $('.tbl_bk_table').val(table_name_string)
            $('#payment_amount').val(self.pos.config.table_reservation_charge);
            this.call_customer_autocomplete();
            $('.open_customer_popover').click(function(event){
                $(event.currentTarget).popover({
                    placement : 'top',
                    html : true,
                    title: 'Create Customer <a class="close_popover"><i class="fa fa-times" aria-hidden="true"/></a>',
                    content: function() {
                        return QWeb.render('CreateCustomerTemplate');
                    },
                });
                $(event.currentTarget).popover('show');
            });
            $(document).on("click", "a.close_popover", function(event) {
                event.stopImmediatePropagation();
                $('.open_customer_popover').popover('hide');
            });
            $(document).on("click", "div.create_cust_btn", function(event) {
                event.stopImmediatePropagation();
                self.submit_create_client();
            });
        },
        validateEmail: function(value){
            var emailPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;
            return emailPattern.test(value);
        },
        submit_create_client: function(){
            var self = this;
            var customer_name = $('#customer_name');
            var customer_mobile = $('#customer_mobile');
            var email = $('#customer_email');
            var valid_email = $('#customer_email').attr('valid_email');
            if(!customer_name.val()){
                $(customer_name).attr('style', 'border: thin solid red !important');
                return false
            } else{
                $(customer_name).attr('style', 'border: 1px solid #ccc; !important');
            }
            if(!customer_mobile.val()){
                $(customer_mobile).attr('style', 'border: thin solid red !important');
                return false
            } else{
                $(customer_mobile).attr('style', 'border: 1px solid #ccc; !important');
            }
            if(!email.val() || valid_email == "false"){
                $(email).attr('style', 'border: thin solid red !important');
                return false
            } else{
                $(email).attr('style', 'border: 1px solid #ccc; !important');
                var res = self.validateEmail(email.val());
                if(!res){
                    alert("Please enter valid Email!");
                    return false
                }
            }
            var fields = _.find(self.pos.models,function(model){ return model.model === 'res.partner'; }).fields;
            var arg = {
                'cust_name':customer_name.val(),
                'cust_email':email.val(),
                'cust_mobile':customer_mobile.val(),
                'fields':fields,
            }
            var params = {
                model: 'res.partner',
                method: 'create_partner',
                args: [arg],
            }
            rpc.query(params, {async: false})
            .then(function(result){
                if(result && result[0]){
                    self.pos.db.add_partners(result)
                    self.partner_id = result[0].id;
                    self.$el.find('.tbl_bk_customer').val(result[0].name)
                    self.$el.find('.tbl_bk_cust_mobile_no').val(result[0].mobile);
                    self.$el.find('.tbl_bk_cust_email_id').val(result[0].email);
                    $('.open_customer_popover').popover('hide');
                }
            });
        },
        click_confirm: function(){
            var self = this;
            var order = self.pos.get_order();
            var payment_amount = $('#payment_amount').val();
            if(self.reservation_date && self.reservation_time && self.no_of_guest && self.table){
                var table_ids = []
                _.each(self.table,function(table){
                    table_ids.push(table.id)
                })
                if(self.partner_id){
                    if(payment_amount >= 0){
                        var tabel_reservation_product_id = self.pos.config.tabel_reservation_product_id;
                        if(tabel_reservation_product_id){
                            var reservation_product = self.pos.db.get_product_by_id(tabel_reservation_product_id[0]);
                            var reservation_charge = self.pos.config.table_reservation_charge;
                            if(reservation_product){
                                var _line = new models.Orderline({}, {pos: self.pos, order: order, product: reservation_product});
                                _line.set_quantity(1);
                                _line.set_unit_price(payment_amount);
                                order.add_orderline(_line);
                                var data = {
                                    'tbl_reserve_datetime':self.reservation_date + ' ' + self.reservation_time,
                                    'table_reserve_amount':payment_amount,
                                    'table_ids':table_ids,
                                    'seats':self.no_of_guest,
                                    'partner_id':self.partner_id,
                                    'duration':self.reservation_duration,
                                    'state':'draft',
                                }
                                var partner = self.pos.db.get_partner_by_id(self.partner_id)
                                self.pos.get_order().set_client(partner);
                                order.set_customer_count(self.no_of_guest);
                                order.set_table_reservation_details(data);
                                if(payment_amount > 0.00){
                                    self.pos.gui.show_screen('payment');
                                } else if(payment_amount == 0.00){
                                    self.pos.chrome.screens.payment.validate_order();
                                }
                            }else{
                                return alert("Reservation product not loaded in pos");
                            }
                        }else{
                            return alert("Please select table reservation charge in pos configuration!");
                        }
                    }else{
                        return alert("Please enter reservation fees!");
                    }
                }else{
                    $('.tbl_bk_customer').focus();
                    return alert("Please select customer");
                }
            }
            self.gui.close_popup();
        },
        click_cancel: function(){
            this._super();
            self.pos.chrome.screens.add_table_reservation_screen.table_seat = 0;
            $('.all_table_show').find('div.each_tbl').removeClass('table_selected');
        },
        call_customer_autocomplete: function(){
            var self = this;
            $('.tbl_bk_customer').autocomplete({
                source: function(request, response) {
                    var query = request.term;
                    var search_timeout = null;
                    if (query) {
                        search_timeout = setTimeout(function() {
                            var partners_list = [];
                            var clients = self.pos.db.search_partner(query);
                            if (clients && clients.length > 0) {
                                _.each(clients, function(partner) {
                                    partners_list.push({
                                        'id': partner.id,
                                        'value': partner.name,
                                        'label': partner.name
                                    });
                                });
                                response(partners_list);
                            }
                        }, 70);
                    }
                },
                select: function(event, partner) {
                    event.stopImmediatePropagation();
                    // event.preventDefault();
                    if(partner.item.id){
                        self.partner_id = partner.item.id;
                    }
                    partner = self.pos.db.get_partner_by_id(partner.item.id);
                    if(partner){
                        if(partner.mobile){
                            self.$el.find('.tbl_bk_cust_mobile_no').val(partner.mobile);
                        }
                        if(partner.email){
                            self.$el.find('.tbl_bk_cust_email_id').val(partner.email);
                        }
                    }
                },
                focus: function(event, ui) {
                    event.preventDefault(); // Prevent the default focus behavior.
                },
                close: function(event) {
                    // it is necessary to prevent ESC key from propagating to field
                    // root, to prevent unwanted discard operations.
                    if (event.which === $.ui.keyCode.ESCAPE) {
                        event.stopPropagation();
                    }
                },
                autoFocus: true,
                html: true,
                minLength: 1,
                delay: 200,
            });
        },
    });
    gui.define_popup({name:'reserve_table_popup', widget: ReserverTablePopupWidget});

    var TokenPopupWidget = PopupWidget.extend({
        template:'TokenPopupWidget',
        show: function(options){
            this._super(options);
            this.journal_id = options.journal_id || false;
            this.renderElement();
            $("input.token_no").focus(function() {
                $('body').off('keypress', self.pos.gui.screen_instances.payment.keyboard_handler);
                $('body').off('keydown',self.pos.gui.screen_instances.payment.keyboard_keydown_handler);
            });
            $("input.token_no").focusout(function() {
                $('body').off('keypress', self.pos.gui.screen_instances.payment.keyboard_handler).keypress(self.pos.gui.screen_instances.payment.keyboard_handler);
                $('body').off('keydown',self.pos.gui.screen_instances.payment.keyboard_keydown_handler).keydown(self.pos.gui.screen_instances.payment.keyboard_keydown_handler);
            });
            $("input.token_no").focus();
        },
        click_confirm: function(){
            var self = this;
            var token_no = $("input.token_no").val();
            if(!token_no){
                $("input.token_no").focus();
                self.pos.db.notification('danger',_t('Please enter token no.'));
            }else{
                self.pos.get_order().set_online_ref_num(token_no);
                self.pos.gui.screen_instances.payment.click_paymentmethods(self.journal_id);
                self.gui.close_popup();
            }
        },
    });
    gui.define_popup({name:'token_popup', widget: TokenPopupWidget});

    var ReturnDetailsPopupWidget = PopupWidget.extend({
        template:'ReturnDetailsPopupWidget',
        events: _.extend({}, PopupWidget.prototype.events, {
            'blur .mobile_number': 'return_mobile_blur',
        }),
        return_mobile_blur: function(ev){
            var self = this;
            var val = $(ev.currentTarget).val();;
            var filter = /^((\+[1-9]{1,4}[ \-]*)|(\([0-9]{2,3}\)[ \-]*)|([0-9]{2,4})[ \-]*)*?[0-9]{3,4}?[ \-]*[0-9]{3,4}?$/;
            if (!filter.test(val)) {
                $('.mobile_number').css('border', '1px solid red');
                self.pos.db.notification('danger',_t('Enter Valid Mobile Number!.'));
                return
            } else{
                $('.mobile_number').css('border', 'none');
                self.valid_mobile = true;
            }
        },
        show: function(options){
            this._super(options);
            this.orderlines = options.lines;
            self.valid_mobile = false;
            $("input.mobile_number").focus(function() {
                $('body').off('keypress', self.pos.gui.screen_instances.payment.keyboard_handler);
                $('body').off('keydown',self.pos.gui.screen_instances.payment.keyboard_keydown_handler);
            });
            $("textarea.reason_for_return").focusout(function() {
                $('body').off('keypress', self.pos.gui.screen_instances.payment.keyboard_handler).keypress(self.pos.gui.screen_instances.payment.keyboard_handler);
                $('body').off('keydown',self.pos.gui.screen_instances.payment.keyboard_keydown_handler).keydown(self.pos.gui.screen_instances.payment.keyboard_keydown_handler);
            });
            $("input.mobile_number").focus();
        },
        click_confirm: function(){
            var self = this;
            var mobile = self.$('.mobile_number').val();
            var reason = self.$('.reason_for_return').val();
            var order = self.pos.get_order();
            if(mobile && reason){
                if(self.valid_mobile){
                    order.set_return_mobile_no(mobile);
                    order.set_return_reason(reason);
                    _.each(self.orderlines,function(line){
                        order.add_orderline(line)
                    })
                    self.gui.close_popup();
                }else{
                    self.pos.db.notification('danger',_t('Enter Valid Mobile Number!'));
                }
            } else{
                self.pos.db.notification('danger',_t('Please fill all information!'));
            }
        },
    });
    gui.define_popup({name:'return_details_popup', widget: ReturnDetailsPopupWidget});

});