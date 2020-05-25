odoo.define('eor_pos_utils.debit_widget', function(require){
"use strict";

var core = require('web.core');
var AbstractField = require('web.AbstractField');
var QWeb = core.qweb;
var field_registry = require('web.field_registry');

var field_utils = require('web.field_utils');

var PaymentDebitWidget = AbstractField.extend({
    _render: function(){
        var self = this;
        var values = JSON.parse(this.value);
        if (!values){
            this.$el.html("");
            return
        }

        values.amount = field_utils.format.float(values.amount, {digits: values.digits});

        this.$el.html(QWeb.render('PaymentDebitWidget', {values: values}));
    }
});

field_registry.add('debit_widget', PaymentDebitWidget);

return {
    PaymentDebitWidget: PaymentDebitWidget
}
});