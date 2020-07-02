# -*- coding: utf-8 -*-

import logging

from odoo import _, api, fields, models

_logger = logging.getLogger("______________________________________________________" + __name__)


class ProductProduct(models.Model):
    _inherit = 'product.product'
    
    @api.model
    def search(self, args, offset=0, limit=None, order=None, count=False):
        if 'search_product' in self.env.context:
            partner_id = self.env.context.get('partner_id')
            Contracts = self.env['contract.contract'].search([('partner_id', '=', partner_id)])
            if Contracts:
                args += [('id', 'in', Contracts.mapped('product_ids').ids)]
        return super(ProductProduct, self).search(args, offset, limit, order, count)


class ResPartner(models.Model):
    _inherit = 'res.partner'
    
    def _compute_order_count(self):
        pos_orderobj = self.env['pos.order']
        for partner in self:
            partner.order_postpago_count = ''

    
    client_pin = fields.Char(string="Pin de seguridad")
    order_postpago_count = fields.Integer(string="Ordenes postpago", compute="_compute_order_count")
    numero_tarjeta = fields.Char(string="Número de tarjeta")
    esquema_subsidio_ids = fields.Many2many('contract.scheme.contract', string='Esquemas de subsidio')
    product_ids = fields.Many2many('product.product', string="Productos")
    credit_blocked = fields.Boolean(string="Bloquear Saldo", default=False)
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
    remaining_credit_limit = fields.Float(string="Crédito Disponible", compute='_get_sales_saldo_partner')
    remaining_credit_amount = fields.Float(string="Remaining Credit Amount", compute="_get_sales_saldo_partner",
                                           store=True, readonly=True)

    pos_order_ids = fields.One2many(comodel_name="pos.order", inverse_name="partner_id", string="Pos Orders",
                                    required=False)
    # TODO: Esquema por producto

    @api.multi
    @api.depends('contract_ids')
    def _compute_schemes_subsidio(self):
        try:
            acumulador = []
            partner_id = self.id
            contracts = self.env['contract.contract'].search([('partner_id', '=', partner_id), ('active', '=', True)])
            for con in contracts:
                if con.type_contract == "subsidio":
                    for sch in con.esquema_subsidio_ids:
                        acumulador.append(sch.id)
            self.ids_schemes_sub = [(6, 0, acumulador)]

            if (len(acumulador) == 0):
                if (self.parent_id):
                    parent_partner = self.env['res.partner'].browse(self.parent_id.id)
                    if parent_partner.type_contract_hide == "subsidio":
                        for sch in parent_partner.ids_schemes_sub:
                            acumulador.append(sch.id)
                        self.ids_schemes_sub = [(6, 0, acumulador)]
                        # acumulador = []
                        # for contract in parent_partner.contract_ids:
                        #    acumulador.append(contract.id)
                        # self.contract_ids = [(6, 0, acumulador)]
        except:
            pass

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
    @api.depends('contract_ids')
    def _compute_schemes_credit(self):

        try:

            acumulador = []
            partner_id = self.id
            contracts = self.env['contract.contract'].search([('partner_id', '=', partner_id), ('active', '=', True)])

            for con in contracts:
                if con.type_contract == "credito":
                    for sch in con.credit_schemes_line_ids:
                        acumulador.append(sch.id)
            self.ids_schemes_contracts = [(6, 0, acumulador)]

            if (len(acumulador) == 0):
                if (self.parent_id):
                    parent_partner = self.env['res.partner'].browse(self.parent_id.id)
                    if parent_partner.type_contract_hide == "credito":
                        acumulador = []
                        for sch in parent_partner.ids_schemes_contracts:
                            acumulador.append(sch.id)
                        self.ids_schemes_contracts = [(6, 0, acumulador)]
                        # acumulador = []
                        # for contract in parent_partner.contract_ids:
                        #    acumulador.append(contract.id)
                        # self.contract_ids = [(6, 0, acumulador)]
        except Exception as e:
            exc_traceback = sys.exc_info()
            # raise Warning(getattr(e, 'message', repr(e))+" ON LINE "+format(sys.exc_info()[-1].tb_lineno))

    @api.multi
    @api.depends('contract_ids')
    def _compute_type_credit(self):
        for rec in self:
            tipo = ""
            if rec.parent_id:
                partner_id = rec.parent_id.id
                contracts = self.env['contract.contract'].search(
                    [('partner_id', '=', partner_id), ('active', '=', True)])
                for con in contracts:
                    if con.type_contract == "credito":
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
                        tipo = "credito"
                    elif con.type_contract == "prepago":
                        tipo = "prepago"
                    elif con.type_contract == "mealplan":
                        tipo = "mealplan"
                    elif con.type_contract == "subsidio":
                        tipo = "subsidio"
                rec.type_contract_hide = tipo

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
        self.update({"credit_limit": self.credit_s_id.quantity})

        for partner_child in self.child_ids:
            _partner_child = self.env['res.partner'].browse(partner_child.id)
            if not _partner_child.credit_s_id:
                _partner_child.sudo().update({"credit_limit": 0})

    def write(self, vals):
        partner = super(ResPartner, self).write(vals)
        for partner in self:
            if (partner.child_ids):
                for partner_child in partner.child_ids:
                    _partner_child = self.env['res.partner'].browse(partner_child.id)
                    if (_partner_child.schemes_sub_id):
                        pass
                    else:
                        _partner_child.sudo().update({"credit_limit": 0})
        return partner

    @api.multi
    @api.depends('pos_order_ids.statement_ids', 'credit_limit')
    def _get_sales_saldo_partner(self):
        for partner in self:
            suma = 0
            pos_orders = partner.pos_order_ids.filtered(lambda r: r.state_order_fac == 'n')
            # and r.is_postpaid is True
            for o in pos_orders:
                for statement in o.statement_ids:
                    if statement.journal_id.code == "POSCR":
                        print("<Statement - " + str(statement.id) + "> <Amount - " + str(
                            statement.amount) + "> <Journal - " + str(statement.journal_id.code) + ">")
                        suma += statement.amount
            saldo = partner.credit_limit - suma
            print(partner.credit_limit)
            print(saldo)
            partner.remaining_credit_amount = suma
            partner.remaining_credit_limit = saldo