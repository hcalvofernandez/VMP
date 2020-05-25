odoo.define("qty_product_pack_discount.OACK", function (require) 
{
    
    "use strict";
    var core = require('web.core');
    var gui = require('point_of_sale.gui');

    var screens = require('point_of_sale.screens');
    var models = require('point_of_sale.models');
    var rpc = require('web.rpc'); 

    models.Order = models.Order.extend(
    {
        set_pricelist: function (pricelist) 
        {
            
            var self = this;
            this.pricelist = pricelist;
    
            var lines_to_recompute = _.filter(this.get_orderlines(), function (line) {
                return ! line.price_manually_set;
            });
            _.each(lines_to_recompute, function (line) 
            {
                if(line.product.uom_id.length == 3)
                {}
                else
                {
                    line.set_unit_price(line.product.get_price(self.pricelist, line.get_quantity()));
                    self.fix_tax_included_price(line);
                }
                
            });
            this.trigger('change');
        }, 
    });

    screens.ClientListScreenWidget.include({
        save_changes: function(){
            var order = this.pos.get_order();
            if( this.has_client_changed() ){
                var default_fiscal_position_id = _.findWhere(this.pos.fiscal_positions, {'id': this.pos.config.default_fiscal_position_id[0]});
                if ( this.new_client ) {
                    var client_fiscal_position_id;
                    if (this.new_client.property_account_position_id ){
                        client_fiscal_position_id = _.findWhere(this.pos.fiscal_positions, {'id': this.new_client.property_account_position_id[0]});
                    }
                    order.fiscal_position = client_fiscal_position_id || default_fiscal_position_id;
                    order.set_pricelist(_.findWhere(this.pos.pricelists, {'id': this.new_client.property_product_pricelist[0]}) || this.pos.default_pricelist);
                } else {
                    order.fiscal_position = default_fiscal_position_id;
                    order.set_pricelist(this.pos.default_pricelist);
                }
    
                order.set_client(this.new_client);

            }
        },
    });

    screens.ProductScreenWidget.include({
        click_product: function(product){
            var list_price = product.list_price;
            var order = this.pos.get_order();
            if(product.to_weight && this.pos.config.iface_electronic_scale){
                this.gui.show_screen('scale',{product: product});
                return;
            }else
            {
                if(product.uom_id[2])
                {
                    var uom_type = product.uom_id[2];
                    var product_prices = rpc.query({
                        model: 'product.template',    
                        method: 'get_product_prices',  
                        args: [product.product_tmpl_id]
                    });
                    if(uom_type=="bigger")
                    {
                        
                        var prices = product_prices.then(function(prices){
                            list_price = prices.pack_price
                            product.lst_price = list_price
                            order.add_product(product);
                            return ;
                        });
                    }
                    else{
                        var prices = product_prices.then(function(prices){
                            list_price = prices.list_price
                            product.lst_price = list_price
                            order.add_product(product);
                            return ;
                        });
                    }   
                    
                }
                else{
                    order.add_product(product);
                    return;
                }                
            }
        },
    });


    var ProductMeasure = screens.ActionButtonWidget.extend(
    {
        template: 'ProductMeasure',
    
        button_click: function()
        {    
        var self = this;
        self.change_product_measure();        
        },    
        change_product_measure: function()
        {
            var order = this.pos.get_order();
            var orderline = order.get_selected_orderline();
            console.log(orderline)
            if(orderline)
            {}
            else{
                this.pos.gui.show_popup('alert', {
                    'title': _t('Unidad de Medida'),
                    'body':  _t('Debe tener una linea seleccionada en el carrito de compra.'),
                });
                return ;
            }

            var product = orderline.product;
            var product_id = product.product_tmpl_id;
            var uom_type = "reference";
            if(orderline.product.uom_id[2])
            {
                uom_type = orderline.product.uom_id[2];
            }
            var uom = rpc.query({
                                        model: 'uom.uom',    
                                        method: 'get_bigger_unit',  
                                        args: [product.uom_id[0], uom_type]
                                    });
            uom.then(function (uom_details) 
                      {
                          if(parseInt(uom_details.id)>0)
                          {
                            
                            var product_prices = rpc.query({
                                model: 'product.template',    
                                method: 'get_product_prices',  
                                args: [product_id]
                            });
                            product_prices.then(function (prices) 
                            {
                                orderline.product.uom_id[0] = uom_details.id;
                                orderline.product.uom_id[1] = uom_details.name;
                                orderline.product.uom_id[2] = uom_details.uom_type;

                                if(uom_details.uom_type=="reference")
                                {
                                  orderline.set_unit_price(prices.list_price);  
                                }
                                if(uom_details.uom_type=="bigger")
                                {
                                  orderline.set_unit_price(prices.pack_price);  
                                }
                                
                                return ;
                            });  
                          }
                          else{
                                this.pos.gui.show_popup('alert', {
                                    'title': _t('Unidad de Medida'),
                                    'body':  _t('No se encontro la unidad de medida mas grande para el producto seleccionado.'),
                                });
                                return ;
                          }
                                                      
                      });             
        }
    });
    
    screens.define_action_button({
        'name': 'change_product_measure',
        'widget': ProductMeasure,
    });
    
});

odoo.define("qty_product_pack_discount.ModelsLoad", function (require) 
{
    var models = require('point_of_sale.models');
    var _super_posmodel = models.PosModel.prototype;
    var exports = {};
    

    models.load_fields('product.template', 'pack_price');

    models.PosModel = models.PosModel.extend({
        initialize: function (session, attributes) {
            // New code
            var product_model = _.find(this.models, function (model) {
                return model.model === 'product.template';
            });
            product_model.fields.push('pack_price');
            
            // Inheritance
            return _super_posmodel.initialize.call(this, session, attributes);
        },
    });
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
});