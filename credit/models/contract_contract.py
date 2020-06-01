# -*- coding:utf-8 -*-
from odoo import models, fields, api
from odoo.exceptions import ValidationError

import logging, sys

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
        store=True,
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

    credit_limit_computed = fields.Float(
        compute='_credit_limit_computed',
        string='Límite de Crédito',
        help=' campo para mostrar el limite de credito ', 
    )
    client_number = fields.Char(
        string='Número de Cliente',
    )

    @api.multi
    @api.depends('credit_limit')
    def _credit_limit_computed(self):
        self.credit_limit_computed = self.credit_limit


    @api.multi
    @api.depends('contract_ids')
    def _compute_schemes_credit(self):
        
        try:
            
            acumulador = []
            partner_id = self.id
            contracts = self.env['contract.contract'].search([('partner_id','=',partner_id),('active','=',True)])

            for con in contracts:
                if con.type_contract == "credito":
                    for sch in con.credit_schemes_line_ids:
                        acumulador.append(sch.id)
            self.ids_schemes_contracts = [(6, 0, acumulador)]

            if(len(acumulador)==0):
                if(self.parent_id):
                    parent_partner = self.env['res.partner'].browse(self.parent_id.id)
                    if  parent_partner.type_contract_hide == "credito":
                        acumulador = []
                        for sch in parent_partner.ids_schemes_contracts:
                            acumulador.append(sch.id)
                        self.ids_schemes_contracts = [(6, 0, acumulador)]
                        #acumulador = []
                        #for contract in parent_partner.contract_ids:
                        #    acumulador.append(contract.id)
                        #self.contract_ids = [(6, 0, acumulador)]
        except Exception as e:
           exc_traceback = sys.exc_info() 
           #raise Warning(getattr(e, 'message', repr(e))+" ON LINE "+format(sys.exc_info()[-1].tb_lineno))

    @api.multi
    @api.depends('contract_ids')
    def _compute_schemes_subsidio(self):
        try:
            acumulador = []
            partner_id = self.id
            contracts = self.env['contract.contract'].search([('partner_id','=',partner_id),('active','=',True)])
            for con in contracts:
                if con.type_contract == "subsidio":
                    for sch in con.esquema_subsidio_ids:
                        acumulador.append(sch.id)
            self.ids_schemes_sub = [(6, 0, acumulador)]

            if(len(acumulador)==0):
                if(self.parent_id):
                    parent_partner = self.env['res.partner'].browse(self.parent_id.id)
                    if  parent_partner.type_contract_hide == "subsidio":
                        for sch in parent_partner.ids_schemes_sub:
                            acumulador.append(sch.id)
                        self.ids_schemes_sub = [(6, 0, acumulador)]
                        #acumulador = []
                        #for contract in parent_partner.contract_ids:
                        #    acumulador.append(contract.id)
                        #self.contract_ids = [(6, 0, acumulador)]
        except:
            pass



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
        #raise Warning(self._origin.read())
        current_credit_limit = self.credit_limit
        new_credit_limit = float(0)

        #if(float(current_credit_limit) > 0):
        #    new_credit_limit = float(current_credit_limit) + float(self.credit_s_id.quantity)
        #else:
        #    new_credit_limit = self.credit_s_id.quantity
        #self.update({"credit_limit":new_credit_limit})
#
        self.update({"credit_limit":self.credit_s_id.quantity})

        for partner_child in self.child_ids:
            _partner_child = self.env['res.partner'].browse(partner_child.id)
            if(_partner_child.credit_s_id):
                pass
            else:
                _partner_child.sudo().update({"credit_limit":0})
    
    @api.onchange('schemes_sub_id')
    def onchange_schemes_sub_id(self):
        current_credit_limit = self.credit_limit
        new_credit_limit = float(0)

        #if(float(current_credit_limit) > 0):
        #    new_credit_limit = float(current_credit_limit) + float(self.schemes_sub_id.qty)
        #else:
        #    new_credit_limit = self.schemes_sub_id.qty
        #self.update({"credit_limit":new_credit_limit})
        #self.update({"credit_limit":new_credit_limit})
        self.update({"credit_limit":self.schemes_sub_id.qty})
        
        for partner_child in self.child_ids:
            _partner_child = self.env['res.partner'].browse(partner_child.id)
            if(_partner_child.schemes_sub_id):
                pass
            else:
                _partner_child.sudo().update({"credit_limit":0})

    def write(self, vals):        
        partner = super(ResPartner, self).write(vals)
        for partner in self:
            if(partner.child_ids):
                for partner_child in partner.child_ids:
                    _partner_child = self.env['res.partner'].browse(partner_child.id)
                    if(_partner_child.schemes_sub_id):
                        pass
                    else:
                        _partner_child.sudo().update({"credit_limit":0})
        return partner