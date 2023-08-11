import Joi from "@hapi/joi";

export default {
  record: Joi.object().keys({
    id: Joi.string().required(),
  }),
};
