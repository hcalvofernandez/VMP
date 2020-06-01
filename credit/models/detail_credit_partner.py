# -*- coding:utf-8 -*-
from odoo import models, fields, api
from odoo.exceptions import ValidationError

import logging

_logger = logging.getLogger(__name__)


class DetailCreditPartner(models.Model):
    _name = 'credit.detail_credit_partner'
    _description = 'module for detail credit partner'


    partner_id = fields.Many2one(
        'res.partner',
        string='Cliente',
    )

    company_id = fields.Many2one(
        'res.company',
        string='Cliente',
    )

    credit_qty = fields.Float(
        string='Crédito',
    )

    credit_balance = fields.Float(
        string='Saldo',
    )