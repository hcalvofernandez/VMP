# -*- coding:utf-8 -*-
from odoo import models, fields, api
from odoo.exceptions import ValidationError

import logging

_logger = logging.getLogger(__name__)


class ResCompany(models.Model):
    _inherit = 'res.company'



class PosOrder(models.Model):
    _inherit = 'pos.order'


    state_order_fac = fields.Selection([
        ('n', 'Nuevo'),
        ('p', 'Proceso'),
        ('f', 'Facturado')],
        string='Estado Factura',
        default='n'
    )