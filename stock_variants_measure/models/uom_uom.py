from odoo import api, fields, models, _
from odoo.exceptions import Warning
from odoo.osv import osv
from odoo.addons import decimal_precision as dp
from odoo.http import request
import json

class uom_uom(models.Model):
    _inherit = 'uom.uom'

    def ready(self,id):
        return str("READY")
  