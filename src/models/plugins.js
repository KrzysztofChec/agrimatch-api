// Shared JSON shape: `id` instead of `_id`, no internals, snake_case timestamps.
module.exports = function cleanJson(schema, hidden = []) {
  schema.set('toJSON', {
    versionKey: false,
    transform(doc, ret) {
      ret.id = String(ret._id);
      delete ret._id;
      hidden.forEach((k) => delete ret[k]);
      return ret;
    },
  });
};
