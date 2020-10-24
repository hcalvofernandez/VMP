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

    # Establecer valores por defecto
    default_dct = {
        'name': None,
        'company_id': tampico_company.id,
    }

    # Obtener productos QUE NO SEAN INSUMOS de "(09) Mendocinos Madero"
    for prod_templ in env['product.template'].search([
        ('company_id.name', '=', '(09) Mendocinos Madero'),
        ('es_insumo', '=', False),
    ]):
        # Copiarlos a "(31) Mendocinos Tampico"
        default_dct['name'] = prod_templ.name
        prod_templ.copy(default_dct)

    # Inhabilitar insumos de "(09) Mendocinos Madero"
    for prod_templ in env['product.template'].search([
        ('company_id.name', '=', '(09) Mendocinos Madero'),
        ('es_insumo', '=', True),
    ]):
        prod_templ.active = False

    # Obtener productos QUE SEAN INSUMOS de "(39) DeliSazon Jaropamex Sabinas"
    for insumo in env['product.template'].search([
        ('company_id.name', '=', '(39) DeliSazon Jaropamex Sabinas'),
        ('es_insumo', '=', True),
    ]):
        # Copiar a insumo a "(31) Mendocinos Tampico"
        insumo.copy({
            'name': insumo.name,
            'company_id': tampico_company.id,
        })
        # Copiar a insumo a "(09) Mendocinos Madero"
        insumo.copy({
            'name': insumo.name,
            'company_id': madero_company.id,
        })
