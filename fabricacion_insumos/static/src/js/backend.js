function process_action_x_pagos()
{
   
    var data = { "params": { } }
    $.ajax({
                type: "POST",
                url: '/pos_z_report/x_report_payments',
                data: JSON.stringify(data),
                dataType: 'json',
                contentType: "application/json",
                async: false,
                success: function(response) 
                    {
                        
                    }
            });
}

function process_form_x_pagos()
{
    var data = { "params": { } }
    $.ajax({
                type: "POST",
                url: '/pos_z_report/x_report_payments',
                data: JSON.stringify(data),
                dataType: 'json',
                contentType: "application/json",
                async: false,
                success: function(response) 
                    {
                        Swal.fire ({
                            title: '<strong>Informe X - Pagos</strong>',
                            icon: '',
                            html:response.result,
                            showCloseButton: true,
                            showCancelButton: true,
                            focusConfirm: false,
                            confirmButtonText:
                            '<i class="fa fa-file-pdf-o ctrl-buttons btn_x_pagos"></i>',
                            confirmButtonAriaLabel: 'Imprimir',
                            cancelButtonText:
                            '<i class="fa fa-close"></i>',
                            cancelButtonAriaLabel: 'Cerrar'
                        });
                    }
            });
}

odoo.define("pos_z_report.efact_Pos", function (require) {
    "use strict";

    $(document).ready(function()
    {
        var mainIntervalTime = 3500;
        var mainInterval = setInterval(function()  {
                                                        if($(".control-buttons").length>0)
                                                        {
                                                            var payment_button = '<i class="fa fa-file-pdf-o ctrl-buttons btn_x_pagos"> X Pagos</i>';
                                                            var orders_button = '<i class="fa fa-file-pdf-o ctrl-buttons btn_x_pedidos"> X Pedidos</i>';
                                                            var product_button = '<i class="fa fa-file-pdf-o ctrl-buttons btn_x_producto"> X Productos</i>';
                                                            var audit_button = '<i class="fa fa-file-pdf-o ctrl-buttons btn_x_auditoria"> X Auditoria</i>';

                                                            var control_buttons = payment_button + orders_button + product_button + audit_button
                                                            //$(".control-buttons").append(control_buttons);
                                                            //$(".control-buttons").removeClass("oe_hidden");
                                                            clearInterval(mainInterval);
                                                            $(document).on("click",".btn_x_pagos",function(){
                                                                process_form_x_pagos();
                                                            });
                                                            $(document).on("click",".btn_x_pedidos",function(){
                                                                
                                                            });
                                                            $(document).on("click",".btn_x_producto",function(){
                                                                
                                                            });
                                                            $(document).on("click",".btn_x_auditoria",function(){
                                                                
                                                            });
                                                        }                                                                                    
                                                    },mainIntervalTime);
    });
   
   
    var models = require("point_of_sale.models");
    models.load_fields('res.company', 'street');
    models.load_fields('res.company', 'street2');
    models.load_fields('res.company', 'city');
    models.load_fields('res.company', 'email');
    models.load_fields('res.company', 'website');
    models.load_fields('res.company', 'partner_id');

    models.load_fields('res.partner', 'email');
    models.load_fields('res.partner', 'fe_nit');
    models.load_fields('res.partner', 'fe_tipo_documento');

    models.load_fields('res.users', 'login');

    models.load_fields('account.tax', 'nombre_tecnico_dian');

    var _super_posmodel = models.PosModel.prototype;
    var exports = {};
    var models = require('point_of_sale.models');
    var screens = require('point_of_sale.screens');

    models.PosModel = models.PosModel.extend({
        initialize: function (session, attributes) {
            // New code
            var company_model = _.find(this.models, function (model) {
                return model.model === 'res.company';
            });
            company_model.fields.push('street');
            company_model.fields.push('city');
            company_model.fields.push('website');
            company_model.fields.push('login');
            company_model.fields.push('email');
            company_model.fields.push('partner_id');
            
            // Inheritance
            return _super_posmodel.initialize.call(this, session, attributes);
        },
    });

    models.PosModel = models.PosModel.extend({
        initialize: function (session, attributes) {

            // New code
            var partner_model = _.find(this.models, function (model) {
                return model.model === 'res.partner';
            });
            partner_model.fields.push('street');
            partner_model.fields.push('city');
            partner_model.fields.push('login');
            partner_model.fields.push('website');
            partner_model.fields.push('email');
            partner_model.fields.push('fe_nit');
            partner_model.fields.push('fe_tipo_documento');

            // Inheritance
            return _super_posmodel.initialize.call(this, session, attributes);
        },
    });

    models.PosModel = models.PosModel.extend({
        initialize: function (session, attributes) {

            // New code
            var product_template = _.find(this.models, function (model) {
                return model.model === 'account.tax';
            });
            product_template.fields.push('nombre_tecnico_dian');

            // Inheritance
            return _super_posmodel.initialize.call(this, session, attributes);
        },
    });

    models.PosModel = models.PosModel.extend({
        initialize: function (session, attributes) {
            var users_model = _.find(this.models, function (model) {
                return model.model === 'res.users';
            });
            users_model.fields.push('login');
            // Inheritance
            return _super_posmodel.initialize.call(this, session, attributes);
        },
    });

  

    screens.ReceiptScreenWidget.include({
        get_receipt_render_env: function() {            
            this.pos.last_receipt_render_env = this._super();
            this.pos.last_receipt_render_env['groupTaxes'] = this.groupTaxes();
            this.pos.last_receipt_render_env['pos_reference'] = 0;
                // this.pos_reference();
            //console.log(this.groupTaxes())
            return this.pos.last_receipt_render_env;
        },
        pos_reference: function() {
            var pos_reference = 0;            
            var data = { "params": {'pos_session_id':this.pos.pos_session.id } };
            $.ajax({
                        type: "POST",
                        url: '/pos_z_report/get_pos_reference',
                        data: JSON.stringify(data),
                        dataType: 'json',
                        contentType: "application/json",
                        async: false,
                        success: function(response) 
                            {
                                pos_reference = response.result;
                                return pos_reference;
                            }
                    });

            return pos_reference;
        },
        groupTaxes: function() {
            var groupTaxes = [];
            var order = this.pos.get_order();
            var orderlines = order.orderlines.models;
            
            for (var j = 0; j < orderlines.length; j++) {
                var line = orderlines[j];
                
                var product = line.get_product();
                if (product.taxes_id.length){
                    for(var i=0;i<product.taxes_id.length;i++)
                    {
                       var tax =  this.pos.taxes_by_id[product.taxes_id[i]];
                       var price_unit = parseFloat(line.price);
                       var qty = parseFloat(line.quantity);
                       var tax_amount_over_price = 0.0;
                       var discount = (parseFloat(price_unit) * parseFloat(qty)) * (parseFloat(line.discount) / 100)
                       var base_price = (parseFloat(price_unit) * parseFloat(qty)) - parseFloat(discount) 

                       if(tax.amount_type=="percent")
                       {
                         tax_amount_over_price = (parseFloat(base_price)) * (parseFloat(tax.amount) / 100)
                         var amount = String(tax.amount) + String("%")
                         var tax_amount_over_price = parseFloat(tax_amount_over_price)
                         var price_subtotal_incl = parseFloat(base_price) + parseFloat(tax_amount_over_price)
                         if(Boolean(tax.price_include)==true)
                         {
                            // console.log(String(monto_afectacion_tributo)+String("=")+String(base_price)+String("- ((")+String(base_price)+String("/")+String("((")+String(tax_amount_over_price)+String("/")+String("100")+String("+1)))"))
                            tax_amount_over_price = base_price - ((base_price / ((parseFloat(tax.amount)/100) + 1) ))   
                         }
                       }
                       if(tax.amount_type=="fixed")
                       {
                         
                         var amount = String(tax.amount);
                         tax_amount_over_price =  parseFloat(amount) * parseFloat(qty);
                         var price_subtotal_incl = parseFloat(base_price) + parseFloat(tax_amount_over_price)  
                         if(Boolean(tax.price_include)==true)
                         {
                            // console.log(String(monto_afectacion_tributo)+String("=")+String(base_price)+String("- ((")+String(base_price)+String("/")+String("((")+String(tax_amount_over_price)+String("/")+String("100")+String("+1)))"))
                            tax_amount_over_price = base_price - ((base_price / ((parseFloat(tax.amount)/100) + 1) ))   
                         }                                            
                       }

                       var price_subtotal = parseFloat((base_price ))

                       if(Boolean(tax.price_include)==true)
                       {
                            price_subtotal -=  tax_amount_over_price;
                       }

                       price_subtotal_incl = price_subtotal
                       price_subtotal_incl +=  tax_amount_over_price
                        
                       //price_subtotal_incl =
                       var groupTaxItem = {
                                            'name':tax.nombre_tecnico_dian,
                                            'type':tax.amount_type,
                                            'amount':amount,
                                            'price_subtotal':String(format3(price_subtotal,this.pos.currency.symbol)).replace(".00",""),
                                            'price_subtotal_incl':String(format3(price_subtotal_incl,this.pos.currency.symbol)).replace(".00",""),
                                            'tax_amount_over_price':String(format3(tax_amount_over_price,this.pos.currency.symbol)).replace(".00",""),
                                            'product_id':product.id,
                                            'price_subtotal_NF':price_subtotal,
                                            'price_subtotal_incl_NF':price_subtotal_incl,
                                            'tax_amount_over_price_NF':tax_amount_over_price,
                                          }
                                          groupTaxes = update_group_taxes(groupTaxes, groupTaxItem, this.pos.currency.symbol)
                    }
                }
            }
            function update_group_taxes(groupTaxes, newGroupTax, symbol)
            {
                if(groupTaxes.length==0)
                {
                    groupTaxes.push(newGroupTax);
                    return groupTaxes;
                }
                var found = false;
                groupTaxes.forEach(function(item)
                {
                    if(    String(item.name)==String(newGroupTax.name)  && String(item.type)==String(newGroupTax.type)  && String(item.amount)==String(newGroupTax.amount))
                    {
                        item.price_subtotal_NF = parseFloat(item.price_subtotal_NF) + parseFloat(newGroupTax.price_subtotal_NF);
                        item.price_subtotal_incl_NF = parseFloat(item.price_subtotal_incl_NF) + parseFloat(newGroupTax.price_subtotal_incl_NF);
                        item.tax_amount_over_price_NF = parseFloat(item.tax_amount_over_price_NF) + parseFloat(newGroupTax.tax_amount_over_price_NF);

                        item.price_subtotal = String(format3(item.price_subtotal_NF,symbol)).replace(".00","");
                        item.price_subtotal_incl =  String(format3(item.price_subtotal_incl_NF,symbol)).replace(".00","");
                        item.tax_amount_over_price =  String(format3(item.tax_amount_over_price_NF,symbol)).replace(".00","");
                        found = true
                    }
                });
                if(found==false)
                {
                    groupTaxes.push(newGroupTax);
                }
                return groupTaxes;
            }
            function format2(n, currency) {
                return currency + n.toFixed(0).replace(/./g, function(c, i, a) {
                    return i > 0 && c !== "." && (a.length - i) % 3 === 0 ? "," + c : c;
                  });
              }
              function format3(n, currency) {
                return currency + n.toFixed(2).replace(/./g, function(c, i, a) {
                    return i > 0 && c !== "." && (a.length - i) % 3 === 0 ? "," + c : c;
                  });
              }
            //console.log(groupTaxes)
            return groupTaxes;
        },
    });
    
    return exports;
});