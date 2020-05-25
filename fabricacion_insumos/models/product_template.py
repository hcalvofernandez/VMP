from odoo import api, fields, models, _
from odoo.exceptions import Warning
from odoo.osv import osv

class product_template(models.Model):
    _inherit = 'product.template'

    es_insumo = fields.Boolean('Insumo')
    