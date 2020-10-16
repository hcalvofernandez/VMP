# -*- coding: utf-8 -*-

import logging
from datetime import timedelta
from functools import partial

import psycopg2
import pytz

from odoo import api, fields, models, tools, _
from odoo.tools import float_is_zero
from odoo.exceptions import UserError
from odoo.http import request
from odoo.addons import decimal_precision as dp

_logger = logging.getLogger(__name__)


class PosOrder(models.Model):
    _name = 'pos.order'
    _inherit = ['pos.order', 'portal.mixin']

    def _compute_access_url(self):
        super(PosOrder, self)._compute_access_url()
        for order in self:
            order.access_url = '/customer/portal/orders/%s' % (order.id)