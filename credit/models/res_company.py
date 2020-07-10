# -*- coding:utf-8 -*-
from odoo import models, fields, api
from odoo.exceptions import ValidationError

import logging

_logger = logging.getLogger(__name__)


class ResCompany(models.Model):
    _inherit = 'res.company'


class PosOrder(models.Model):
    _inherit = 'pos.order'

    period_log_id = fields.Many2one("credit.invoice_period_log", string="Periodo de la orden")
    state_order_fac = fields.Selection([
        ('n', 'Nuevo'),
        ('p', 'Proceso'),
        ('f', 'Facturado')],
        string='Estado Factura',
        default='n'
    )