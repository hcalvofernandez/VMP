from odoo import api, fields, models, _
from odoo.exceptions import Warning
from odoo.osv import osv
from odoo.addons import decimal_precision as dp
from odoo.http import request

class product_template_attribute_value(models.Model):
    _inherit = 'product.template.attribute.value'

    cost_price = fields.Float('Precio Costo', default=0.0, help="Costo por compra.")
    variant_puom = fields.Selection(name="variant_puom", string='Unidad de medida', selection='_compute_product_variant_uom_selection', store=True)
    variant_ratio = fields.Float('Rendimiento', digits = (12,3), default=0.0)

    _columns = {"variant_puom":fields.Selection(name="variant_puom", string='Unidad de medida', selection='_compute_product_variant_uom_selection')}
    

    def _compute_product_variant_uom_selection(self):
        uom_units = self.env['uom.uom'].search([('active','=',True)],order='category_id desc')
        vector_uom_units = []
        for unit in uom_units:
            item = (str(unit.id) + str("-") + str(unit.name), unit.name)
            vector_uom_units.append(item)        
        return vector_uom_units