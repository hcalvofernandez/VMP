# -*- coding: utf-8 -*-

from . import models

def post_init(cr, registry):
    from odoo import api, SUPERUSER_ID

    env = api.Environment(cr, SUPERUSER_ID, {})
    for user in env['res.users'].search([('share', '=', False), ('show_menu_ids', '=', False)]):
        user.write({'show_menu_ids': user._default_show_menu_ids()})
