# -*- coding:utf-8 -*-
from odoo import models, fields, api
from odoo.exceptions import ValidationError

import logging

_logger = logging.getLogger(__name__)


class CreditSchemes(models.Model):
    _name = 'credit.credit_schemes'
    _description = 'module for credit schemes'
    _rec_name = 'scheme'

    active = fields.Boolean (string="Estatus", required=False, default=True)
    scheme = fields.Char(string='Esquema de Crédito',required=True)
    quantity = fields.Float(string='Cantidad',required=True)
