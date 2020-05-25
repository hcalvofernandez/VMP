# -*- coding:utf-8 -*-
from odoo import models, fields, api
from odoo.exceptions import ValidationError

import logging

_logger = logging.getLogger(__name__)


class ContractContract(models.Model):
    _inherit = 'contract.contract'


    credit_schemes_line_ids = fields.Many2many(
        'credit.credit_schemes',
        string='Esquemas de Crédito',
    )