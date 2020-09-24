from odoo import api, fields, models, _
from odoo.exceptions import ValidationError
from odoo.osv import osv
from odoo.addons import decimal_precision as dp
from odoo.http import request

class product_template_attribute_value(models.Model):
    _inherit = 'product.template.attribute.value'

    cost_price = fields.Float('Precio Costo', default=0.0, help="Costo por compra.")
    variant_puom = fields.Selection(name="variant_puom", string='Unidad de medida', selection='_compute_product_variant_uom_selection', store=True)
    variant_ratio = fields.Float('Rendimiento', digits=(12, 3), default=0.0)

    _columns = {"variant_puom":fields.Selection(name="variant_puom", string='Unidad de medida', selection='_compute_product_variant_uom_selection')}
    

    def _compute_product_variant_uom_selection(self):
        uom_units = self.env['uom.uom'].search([('active','=',True)],order='category_id desc')
        vector_uom_units = []
        for unit in uom_units:
            item = (str(unit.id) + str("-") + str(unit.name), unit.name)
            vector_uom_units.append(item)        
        return vector_uom_units

    @api.multi
    def write(self, values):
        if 'cost_price' in values:
            new_cost = values['cost_price']
            group_user_ids = self.env.user.groups_id.mapped('id')
            margin = float(self.env['ir.config_parameter'].get_param('stock_variants_measure.inflation_cost'))
            group_user = self.env.ref('stock_variants_measure.group_inventory_cost_employee').id
            group_manager = self.env.ref('stock_variants_measure.group_inventory_cost_manager').id
            for attr in self:
                if attr.cost_price != 0:
                    difference = new_cost/attr.cost_price*100 - 100
                else:
                    difference = 100 #if cost_price field equal 0, it set the increment as 100%
                if difference <= margin:
                    if group_user in group_user_ids or group_manager in group_user_ids:
                        continue
                elif difference > margin:
                    if group_manager in group_user_ids:
                        continue
                raise ValidationError(_("You do not have permission to set the new cost value for the product"))
        return super(product_template_attribute_value, self).write(values)

