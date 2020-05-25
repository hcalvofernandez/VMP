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



class ResPartner(models.Model):
    _inherit = 'res.partner'


    credit_s_id = fields.Many2one(
        'credit.credit_schemes',
        string='Esquema de Crédito',
    )

    ids_schemes_contracts = fields.Many2many(
        'credit.credit_schemes',
        compute='_compute_schemes_credit',
        store=False,
        string='Esquemas de Crédito',
    )


    schemes_sub_id = fields.Many2one(
        'contract.scheme.contract',
        string='Esquema de Subsidio',
    )
    ids_schemes_sub = fields.Many2many(
        'contract.scheme.contract',
        compute='_compute_schemes_subsidio',
        store=False,
        string='Esquemas de Subsidio',
    )


    type_contract_hide = fields.Char(
        compute='_compute_type_credit',
        string='Tipo de contrato',
        help=' tipos de  contrato - , credito, prepago, mealplan, subsidio', 
    )

    @api.multi
    @api.depends('contract_ids')
    def _compute_schemes_credit(self):
        acumulador = []
        partner_id = self.id
        contracts = self.env['contract.contract'].search([('partner_id','=',partner_id),('active','=',True)])
        for con in contracts:
            if con.type_contract == "credito":
                for sch in con.credit_schemes_line_ids:
                    acumulador.append(sch.id)
        self.ids_schemes_contracts = [(6, 0, acumulador)]

    @api.multi
    @api.depends('contract_ids')
    def _compute_schemes_subsidio(self):
        acumulador = []
        partner_id = self.id
        contracts = self.env['contract.contract'].search([('partner_id','=',partner_id),('active','=',True)])
        for con in contracts:
            if con.type_contract == "subsidio":
                for sch in con.esquema_subsidio_ids:
                    acumulador.append(sch.id)
        self.ids_schemes_sub = [(6, 0, acumulador)]



    @api.multi
    @api.depends('contract_ids')
    def _compute_type_credit(self):
        tipo = ""
        partner_id = self.id
        contracts = self.env['contract.contract'].search([('partner_id','=',partner_id),('active','=',True)])
        for con in contracts:
            if con.type_contract == "credito":
                tipo = "credito"
            elif con.type_contract == "prepago":
                tipo = "prepago"
            elif con.type_contract == "mealplan":
                tipo = "mealplan"
            elif con.type_contract == "subsidio":
                tipo = "subsidio"
        self.type_contract_hide = tipo


    @api.multi
    @api.onchange('credit_s_id')
    def onchange_credit_s_id(self):
        self.credit_limit = self.credit_s_id.quantity