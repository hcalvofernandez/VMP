# -*- coding:utf-8 -*-
from odoo import models, fields, api
from odoo.exceptions import ValidationError

import logging

_logger = logging.getLogger(__name__)


class ResPartner(models.Model):
    _inherit = 'res.partner'


    credit_s_id = fields.Many2one(
        'credit.credit_schemes',
        string='Esquema de Crédito',
        domain = lambda self: self._domain_credit_s_id(),
    )


    @api.multi
    def _domain_credit_s_id(self):
        acumulador = []
        partner_id = self.id
        contracts = self.env['contract.contract'].search([('partner_id','=',partner_id),('active','=',True)])
        _logger.error('🍖🍖🍖🍖 CONTRATOS'+str(contracts)+'🍖🍖🍖🍖')
        for con in contracts:
            if con.type_contract == "credito":
                for sch in con.credit_schemes_line_ids:
                    acumulador.append(sch.id)
        _logger.error('🍖🍖🍖🍖 ACUMULADOR '+str(acumulador)+'🍖🍖🍖🍖')
        domain = [('id','in',acumulador)]
        _logger.error('🍖🍖🍖🍖 DOMAIN '+str(domain)+'🍖🍖🍖🍖')
        return domain


    @api.multi
    @api.onchange('credit_s_id')
    def onchange_credit_s_id(self):
        self.credit_limit = self.credit_s_id.quantity