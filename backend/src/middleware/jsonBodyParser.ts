import express from "express";
import { getConfig } from "../config";

export function jsonBodyParser(limit = getConfig().jsonBodyLimit) {
  return express.json({ limit });
}
