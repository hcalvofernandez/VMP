from odoo import api, fields, models, _
from odoo.exceptions import Warning
from odoo.osv import osv
from odoo.addons import decimal_precision as dp
from odoo.http import request

class sale_order_line(models.Model):
    _inherit = 'sale.order.line'
    rendimiento = fields.Float('Rendimiento', digits = (12,3), store=True)

    _columns = {
                    'rendimiento': fields.Float('Rendimiento'),
               }

    @api.onchange('product_id', 'price_unit', 'product_uom', 'product_uom_qty', 'tax_id')
    def update_after_product_id(self):
        if(self.product_id.id): 
            product_template =  self.env['product.template'].search([('id','=',self.product_id.product_tmpl_id.id)])

            query = "select product_attribute_value_id from product_attribute_value_product_product_rel where product_product_id = "+str(self.product_id.id)
            request.cr.execute(query)
            product_attribute_value_product_product_rel = request.cr.dictfetchone()

            if(product_attribute_value_product_product_rel):        
                product_variant =  self.env['product.template.attribute.value'].search([('product_attribute_value_id','=', product_attribute_value_product_product_rel['product_attribute_value_id'])])
                product_template_variant_values =  self.env['product.template.attribute.value'].search([('product_attribute_value_id','=', product_attribute_value_product_product_rel['product_attribute_value_id'])])
                
                variant_puom = product_variant.variant_puom
                if(len(variant_puom) > 0):
                    variant_puom = variant_puom.split('-')
                    variant_puom_id = variant_puom[0]
                    #variant_puom_name = variant_puom[1]                
                    #factor_inv = self._get_factor_inv(variant_puom_id)
                    #uom_reference = self._get_uom_reference(variant_puom_id)
                    self.product_uom = int(variant_puom_id)
                    #raise Warning(product_template_variant_values.price_extra)
                    self.price_unit =  float(product_template_variant_values.price_extra)
                    if not (self.product_id and self.product_uom and

                        self.order_id.partner_id and self.order_id.pricelist_id and

                        self.order_id.pricelist_id.discount_policy == 'without_discount' and

                        self.env.user.has_group('sale.group_discount_per_so_line')):
                        return 

    def _get_factor_inv(self, unit_id):
        uom =  self.env['uom.uom'].search([('active','=',True),('id','=',unit_id)],limit=1)
        return uom.factor_inv

    def _get_uom_reference(self,any_uom_id):              
        uom =  self.env['uom.uom'].search([('id','=',any_uom_id)],limit=1)
        uom_reference =  self.env['uom.uom'].search([('active','=',True),('category_id','=',uom.category_id.id), ('uom_type','=','reference')],limit=1)
        return uom_reference