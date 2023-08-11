import mongoose from "../../services/db/mongoose.js";

export const Transaction = mongoose.model(
  "Transaction",
  {
    id: {
      type: String,
      required: true,
      unique: true,
    },
  },
  "transactions"
);
