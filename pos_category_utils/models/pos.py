# -*- coding: utf-8 -*-

from odoo import models, fields, api, tools, _
import logging


_logger = logging.getLogger('_______________________________________________________'+__name__)

class PosConfig(models.Model):
    _inherit = 'pos.config'

    pos_category_ids = fields.Many2many('pos.category', string='Categorías TPV')

    @api.onchange('pos_category_ids')
    def _onchange_pos_category_ids(self):
        if len(self.pos_category_ids):
            return {'domain': {'iface_start_categ_id': [('id', 'child_of', self.pos_category_ids.ids)]}}


class ProductCategory(models.Model):
    _inherit = "pos.category"

    @api.model
    def search(self, args, offset=0, limit=None, order=None, count=False):
        if self.env.context.get('pos_category_utils_search', False):
            pos_session = self.env['pos.session'].search([('user_id', '=', self.env.context.get('uid')), ('state', '=', 'opened')])
            if pos_session and len(pos_session.config_id.pos_category_ids):
                args += [('id', 'child_of', pos_session.config_id.pos_category_ids.ids)]
                context = dict(self.env.context)
                del context['pos_category_utils_search']
                res = super(ProductCategory, self.with_context(context)).search(args=args, offset=offset, limit=limit, order=order, count=count)
            else:
                res = super(ProductCategory, self).search(args=args, offset=offset, limit=limit, order=order,
                                                          count=count)
        else:
            res = super(ProductCategory, self).search(args=args, offset=offset, limit=limit, order=order, count=count)

        return res
