odoo.define('eor_pos_utils.cash_widget', function(require){
"use stric";

var AbstractField = require('web.AbstractField');
var core = require('web.core');
var field_registry = require('web.field_registry');
var QWeb = core.qweb;
var field_utils = require('web.field_utils');

var CashControlWidget = AbstractField.extend({
    _render: function(){
        var self = this;
        var data = JSON.parse(this.value);

        if (!data){
            this.$el.html("");
            return
        }
        _.each(data, function(k, v){
            k.ventas = field_utils.format.float(k.ventas, {digits: k.digits});
            k.ingresos = field_utils.format.float(k.ingresos, {digits: k.digits});
            k.retiros = field_utils.format.float(k.retiros, {digits: k.digits});
            k.transacciones = field_utils.format.float(k.transacciones, {digits: k.digits});
        });
        this.$el.html(QWeb.render('CashControlWidget', {values: data}));
    }
});

field_registry.add('cash_widget', CashControlWidget);

return {
    CashControlWidget: CashControlWidget
}
});