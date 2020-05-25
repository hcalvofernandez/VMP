# -*- coding: utf-8 -*-

import logging

from odoo import _, api, fields, models

_logger = logging.getLogger(__name__)


class AccountPayment(models.Model):
    _inherit = 'account.payment'

    pos_session_id = fields.Many2one('pos.session', string='Sesion POS') 


class AccountCashboxLine(models.Model):
    _inherit = 'account.cashbox.line'

    is_coin = fields.Boolean(string="Is coin?", default=True)


class AccountJournal(models.Model):
    _inherit = 'account.journal'

    hide_journal = fields.Boolean(string="Ocultar diario")
