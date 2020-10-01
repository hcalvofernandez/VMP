# -*- coding: utf-8 -*

from odoo import fields, models


class LiquidationLog (models.Model):
    _name = 'origin_application_resources.liquidation_log'
    _description = 'Origin and Application Liquidation Log'
    _parent_name = 'last_guard'
    _parent_store = False

    company_id = fields.Many2one('res.company')
    name = fields.Char(related="liquidation_move.name")
    previous_guard = fields.Float(string="Previous Guard")
    origin_amount = fields.Float(string="Origin Amount")
    application_amount = fields.Float(string="Application Amount")
    to_settle = fields.Float(string="To Settle")
    to_deposit = fields.Float(string="To Deposit")
    in_guard = fields.Float(string="In Guard")

    last_guard = fields.Many2one("origin_application_resources.liquidation_log")
    origin_to_settle = fields.One2many("account.move.line", "liquidation_origin_id")
    application_to_settle = fields.One2many("account.move.line", "liquidation_id")
    liquidation_move = fields.Many2one('account.move')
