# -*- coding: utf-8 -*-

from odoo import models, api


class AccountPayment(models.Model):
    _inherit = 'account.payment'

    def _create_payment_entry(self, amount):
        move = super(AccountPayment, self)._create_payment_entry(amount)
        move.write({'oar_type': 'application'})
        return move
    


