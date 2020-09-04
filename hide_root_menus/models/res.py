# -*- coding: utf-8 -*-

import logging
from odoo import api, fields, models, tools, _
_logger = logging.getLogger(__name__)


class UserMenuLine(models.Model):
    _name = 'hide_root_menus.user_menu_line'
    user_id = fields.Many2one('res.users', 'Usuario', required=True)
    menu_id = fields.Many2one('ir.ui.menu', u'Menú', required=True, domain="[('parent_id', '=', False)]")
    show = fields.Boolean('Mostrar', required=True, default=True)


class ResUsers(models.Model):
    _inherit = 'res.users'

    def _default_show_menu_ids(self):
        if not self.share:
            menus = self.env['ir.ui.menu'].sudo().search([('parent_id', '=', False)])
            res = []
            for menu in menus:
                res.append((0, 0, {'menu_id': menu.id, 'show': True}))

            return res
        else:
            return []

    show_menu_ids = fields.One2many('hide_root_menus.user_menu_line', 'user_id', string=u'Menús', required=True, default=_default_show_menu_ids)

    @api.multi
    def write(self, values):
        res = super(ResUsers, self).write(values)
        if 'show_menu_ids' in values:
            self.clear_caches()
        return res