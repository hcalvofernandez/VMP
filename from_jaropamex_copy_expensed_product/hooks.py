# -*- coding: utf-8 -*-
# unlink_doc
from odoo import SUPERUSER_ID, api


def post_init_hook(cr, registry):
    # Get Environment
    env = api.Environment(cr, SUPERUSER_ID, {})

    # Obtener compañía "(31) Mendocinos Tampico"
    tampico_company = env['res.company'].search([
        ('name', '=', '(31) Mendocinos Tampico')
    ]).ensure_one()

    # Obtener compañía "(09) Mendocinos Madero"
    madero_company = env['res.company'].search([
        ('name', '=', '(09) Mendocinos Madero')
    ]).ensure_one()

    # Obtener productos QUE puedan ser comprados y que puedan ser un gasto de "(39) DeliSazon Jaropamex Sabinas"
    for expensed_product in env['product.template'].search([
        ('company_id.name', '=', '(39) DeliSazon Jaropamex Sabinas'),
        ('can_be_expensed', '=', True), ('purchase_ok', '=', True),
    ]):
        # Copiar a insumo a "(31) Mendocinos Tampico"
        expensed_product.copy({
            'name': expensed_product.name,
            'company_id': tampico_company.id,
        })
        # Copiar a insumo a "(09) Mendocinos Madero"
        expensed_product.copy({
            'name': expensed_product.name,
            'company_id': madero_company.id,
        })
