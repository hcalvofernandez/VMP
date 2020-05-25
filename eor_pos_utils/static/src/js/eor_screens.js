odoo.define('eor_pos_utils.screens', function (require) {
"use strict";

var core = require('web.core');
var PopupWidget = require('point_of_sale.popups');
var gui = require('point_of_sale.gui');

var ChashierPinPopupWidget = PopupWidget.extend({
        template: 'CashierPipPopupWidget',
        show: function(options){
            this._super(options);
            this.options = options;
            $("#pin").focus(function() {
                $('body').off('keypress', self.pos.gui.screen_instances.payment.keyboard_handler);
                $('body').off('keydown',self.pos.gui.screen_instances.payment.keyboard_keydown_handler);
            });
        },
        click_confirm: function(){
            var self = this;
            var client_pin = this.options.cashier.client_pin || false;
            var pin = $("#pin").val();
            var order = self.pos.get_order();
            var client = order.get_client();
            var amount = order.get_total_with_tax() - order.get_total_paid();

            if (client_pin && pin ===client_pin){
                self.pos.db.notification('success',"PIN correcto!"); 
                self.gui.close_popup();
                console.log(this.options);
                if (this.options.payment){
                    this.options.payment.do_order(order, this.options.type);
                }
            }else{
                self.pos.db.notification('danger',_t('Pin Incorrecto, Intente de nuevo!'));
                return
            }
        }
});

gui.define_popup({name: 'show_pop_pin', widget: ChashierPinPopupWidget});


});
