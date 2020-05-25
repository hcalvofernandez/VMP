from odoo import api, fields, models, _
from odoo.exceptions import Warning
from odoo.osv import osv
from odoo.addons import decimal_precision as dp
from odoo.http import request

class product_template(models.Model):
    _inherit = 'product.template'
   
    @api.model
    def ready(self,id):
        return str("READY")