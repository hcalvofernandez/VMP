# -*- coding: utf-8 -*-

import logging

from odoo import _, api, fields, models
from odoo.exceptions import UserError, ValidationError

_logger = logging.getLogger("______________________________________________________" + __name__)


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    @api.constrains('default_code')
    def validate_default_code(self):
        if self.default_code and self.default_code is not '':
            exist = self.env['product.product'].search(
                [('product_tmpl_id', '!=', self.id), ('product_tmpl_id.company_id', '=', self.company_id.id),
                 ('default_code', '=', self.default_code)])
            if exist:
                raise ValidationError('La referencia interna del producto debe ser única en la compañia.')
            else:
                exist = self.env['product.template'].search(
                    [('id', '!=', self.id), ('company_id', '=', self.company_id.id),
                     ('default_code', '=', self.default_code)])
                if exist:
                    raise ValidationError('La referencia interna del producto debe ser única en la compañia.')


class ProductProduct(models.Model):
    _inherit = 'product.product'

    @api.constrains('default_code')
    def validate_default_code(self):
        if self.default_code and self.default_code is not '':
            exist = self.env['product.product'].search([('id', '!=', self.id), ('product_tmpl_id.company_id', '=', self.product_tmpl_id.company_id.id), ('default_code', '=', self.default_code)])
            if exist:
                raise ValidationError('La referencia interna del producto debe ser única en la compañia.')
            else:
                exist = self.env['product.template'].search(
                    [('id', '!=', self.product_tmpl_id.id), ('company_id', '=', self.product_tmpl_id.company_id.id),
                     ('default_code', '=', self.default_code)])
                if exist:
                    raise ValidationError('La referencia interna del producto debe ser única en la compañia.')


    @api.model
    def search(self, args, offset=0, limit=None, order=None, count=False):
        if 'search_product' in self.env.context:
            partner_id = self.env.context.get('partner_id')
            Contracts = self.env['contract.contract'].search([('partner_id', '=', partner_id)])
            if Contracts:
                args += [('id', 'in', Contracts.mapped('product_ids').ids)]
        return super(ProductProduct, self).search(args, offset, limit, order, count)

class PosOrder(models.Model):
    _inherit = 'pos.order'

    credit_amount = fields.Float(string="Importe Créditos", compute="_get_credit_amount", store=True)

    @api.multi
    @api.depends("statement_ids")
    def _get_credit_amount(self):
        for order in self:
            sum = 0
            for statement in order.statement_ids:
                if statement.journal_id.code == "POSCR":
                    sum += statement.amount
            order.credit_amount = sum

class ResPartner(models.Model):
    _inherit = 'res.partner'

    def _compute_order_count(self):
        pos_orderobj = self.env['pos.order']
        for partner in self:
            partner.order_postpago_count = ''

    
    client_pin = fields.Char(string="Pin de seguridad")
    numero_tarjeta = fields.Char(string="Número de tarjeta")
    esquema_subsidio_ids = fields.Many2many('contract.scheme.contract', string='Esquemas de subsidio')
    product_ids = fields.Many2many('product.product', string="Productos")
    credit_blocked = fields.Boolean(string="Bloquear Saldo", default=False)
    schemes_sub_id = fields.Many2one('contract.scheme.contract', string='Esquema de Subsidio')
    client_number = fields.Char(string='Número de Cliente')
    has_credit_contract = fields.Boolean(string="Tiene contrato de crédito", compute='_compute_type_credit')

    pos_order_ids = fields.One2many(comodel_name="pos.order", inverse_name="partner_id", string="Pos Orders",
                                    required=False)

    # Computed fields
    order_postpago_count = fields.Integer(string="Ordenes postpago", compute="_compute_order_count", store=True)
    ids_schemes_sub = fields.Many2many('contract.scheme.contract',
                                       string='Esquemas de Subsidio')
    credit_s_id = fields.Many2one('credit.credit_schemes', string='Esquema de Crédito')
    ids_schemes_contracts = fields.Many2many('credit.credit_schemes', compute='_compute_schemes_credit', store=True,
                                             string='Esquemas de Crédito')

    type_contract_hide = fields.Char(string='Tipo de contrato',
                                     help=' tipos de  contrato - , credito, prepago, mealplan, subsidio')

    credit_limit_computed = fields.Float(compute='_credit_limit_computed', string='Límite de Crédito',
                                         help=' campo para mostrar el limite de credito ')
    remaining_credit_limit = fields.Float(string="Crédito Disponible", compute='_get_sales_saldo_partner', store=True)
    remaining_credit_amount = fields.Float(string="Remaining Credit Amount", compute="_get_sales_saldo_partner",
                                           store=True, readonly=True)

    # TODO: Esquema por producto

    @api.multi
    @api.depends('contract_ids.esquema_subsidio_ids', 'parent_id.contract_ids.esquema_subsidio_ids')
    def _compute_schemes_subsidio(self):
        for partner in self:
            contracts = partner.contract_ids + partner.parent_id.contract_ids
            sub_contracts = contracts.filtered(lambda contract: contract.type_contract == 'subsidio')
            partner.ids_schemes_sub = [(6, 0, sub_contracts.esquema_subsidio_ids.mapped('id'))]


            # try:
            #     acumulador = []
            #     partner_id = partner.id
            #     contracts = self.env['contract.contract'].search([('partner_id', '=', partner_id), ('active', '=', True)])
            #     for con in contracts:
            #         if con.type_contract == "subsidio":
            #             for sch in con.esquema_subsidio_ids:
            #                 acumulador.append(sch.id)
            #     partner.ids_schemes_sub = [(6, 0, acumulador)]
            #
            #     if (len(acumulador) == 0):
            #         if (partner.parent_id):
            #             parent_partner = self.env['res.partner'].browse(partner.parent_id.id)
            #             if parent_partner.type_contract_hide == "subsidio":
            #                 for sch in parent_partner.ids_schemes_sub:
            #                     acumulador.append(sch.id)
            #                 partner.ids_schemes_sub = [(6, 0, acumulador)]
            #                 # acumulador = []
            #                 # for contract in parent_partner.contract_ids:
            #                 #    acumulador.append(contract.id)
            #                 # self.contract_ids = [(6, 0, acumulador)]
            # except:
            #     pass

    @api.model
    def update_pin(self, partner_id, new_pin):
        partner = self.browse(partner_id)
        res = {'msg': 'Pin actualizado correctamente!', 'error': False}
        if partner:
            if new_pin == partner.client_pin:
                res['msg'] = 'El nuevo PIN debe ser diferente al anterior'
                res['error'] = True
            else:
                partner.sudo().write({'client_pin': new_pin})
        return res

    # -----

    @api.multi
    @api.depends('credit_limit')
    def _credit_limit_computed(self):
        for rec in self:
            rec.credit_limit_computed = rec.credit_limit

    @api.multi
    @api.depends('contract_ids.credit_schemes_line_ids', 'parent_id.contract_ids.credit_schemes_line_ids')
    def _compute_schemes_credit(self):
        for partner in self:
            contracts = partner.contract_ids + partner.parent_id.contract_ids
            sub_contracts = contracts.filtered(lambda contract: contract.type_contract == 'credito')
            partner.ids_schemes_contracts = sub_contracts.mapped('credit_schemes_line_ids')

            # acumulador = []
            # contracts = partner.contract_ids
            #
            # for con in contracts:
            #     if con.type_contract == "credito":
            #         for sch in con.credit_schemes_line_ids:
            #             acumulador.append(sch.id)
            # partner.ids_schemes_contracts = [(6, 0, acumulador)]
            #
            # if (len(acumulador) == 0):
            #     if (partner.parent_id):
            #         parent_partner = partner.env['res.partner'].browse(partner.parent_id.id)
            #         if parent_partner.type_contract_hide == "credito":
            #             acumulador = []
            #             for sch in parent_partner.ids_schemes_contracts:
            #                 acumulador.append(sch.id)
            #             partner.ids_schemes_contracts = [(6, 0, acumulador)]
            #             # acumulador = []
            #             # for contract in parent_partner.contract_ids:
            #             #    acumulador.append(contract.id)
            #             # self.contract_ids = [(6, 0, acumulador)]

    @api.multi
    @api.depends('contract_ids', 'parent_id', 'contract_ids.credit_schemes_line_ids')
    def _compute_type_credit(self):
        for rec in self:
            tipo = ""
            rec.has_credit_contract = False
            if rec.parent_id:
                partner_id = rec.parent_id.id
                contracts = self.env['contract.contract'].search(
                    [('partner_id', '=', partner_id), ('active', '=', True)])
                for con in contracts:
                    if con.type_contract == "credito":
                        rec.has_credit_contract = True
                        tipo = "credito"
                    elif con.type_contract == "prepago":
                        tipo = "prepago"
                    elif con.type_contract == "mealplan":
                        tipo = "mealplan"
                    elif con.type_contract == "subsidio":
                        tipo = "subsidio"
                rec.type_contract_hide = tipo
            else:
                partner_id = rec.id
                contracts = self.env['contract.contract'].search(
                    [('partner_id', '=', partner_id), ('active', '=', True)])
                for con in contracts:
                    if con.type_contract == "credito":
                        rec.has_credit_contract = True
                        tipo = "credito"
                    elif con.type_contract == "prepago":
                        tipo = "prepago"
                    elif con.type_contract == "mealplan":
                        tipo = "mealplan"
                    elif con.type_contract == "subsidio":
                        tipo = "subsidio"
                rec.type_contract_hide = tipo

    def cron_recalcule_limit(self):
        parents = self.env['res.partner'].search([('customer', '=', 1), ('parent_id', '=', False)])
        for parent in parents:
            print(parent)
            vals = {'credit_limit': parent.credit_s_id.quantity}
            parent.child_ids.write(vals)

    @api.multi
    @api.onchange('credit_s_id')
    def onchange_credit_s_id(self):
        # raise Warning(self._origin.read())
        # current_credit_limit = self.credit_limit
        # new_credit_limit = float(0)

        # if(float(current_credit_limit) > 0):
        #    new_credit_limit = float(current_credit_limit) + float(self.credit_s_id.quantity)
        # else:
        #    new_credit_limit = self.credit_s_id.quantity
        # self.update({"credit_limit":new_credit_limit})
        #
        if self.credit_s_id and self.has_credit_contract:
            self.update({"credit_limit": self.credit_s_id.quantity})
        else:
            self.update({"credit_limit": 0.0})

        # for partner_child in self.child_ids:
        #     _partner_child = self.env['res.partner'].browse(partner_child.id)
        #     if not _partner_child.credit_s_id:
        #         _partner_child.sudo().update({"credit_limit": 0})

    @api.multi
    def write(self, vals):
        if 'ids_schemes_contracts' in vals and 'credit_s_id' not in vals:
            if len(self) == 1:
                if self.credit_s_id and self.credit_s_id.id not in vals['ids_schemes_contracts'][0][2]:
                    vals['credit_s_id'] = False
                    vals['credit_limit'] = 0
        partner = super(ResPartner, self).write(vals)
        return partner
    

    @api.multi
    @api.depends('pos_order_ids.credit_amount', 'pos_order_ids.state_order_fac', 'credit_limit')
    def _get_sales_saldo_partner(self):
        for partner in self:
            if partner.credit_limit > 0:
                pos_orders = partner.pos_order_ids.filtered(lambda r: r.state_order_fac == 'n' and r.credit_amount > 0)
                # and r.is_postpaid is True
                suma = sum(o.credit_amount for o in pos_orders) or 0.0
                saldo = partner.credit_limit - suma
                partner.remaining_credit_amount = suma
                partner.remaining_credit_limit = saldo
            else:
                partner.remaining_credit_limit = 0
