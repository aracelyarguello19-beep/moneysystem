import { z } from "zod";

export const signUpSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});
export type SignUpInput = z.infer<typeof signUpSchema>;

// Solo para el formulario de registro (nunca viaja al servidor):
// `confirmarPassword` no es un campo de `Cuenta`, existe únicamente para que
// el cliente valide que las dos contraseñas tipeadas coinciden antes de
// llamar a `signUp`.
export const registroFormSchema = signUpSchema
  .extend({ confirmarPassword: z.string().min(1, "Confirmá la contraseña") })
  .refine((data) => data.password === data.confirmarPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmarPassword"],
  });
export type RegistroFormInput = z.infer<typeof registroFormSchema>;

export const signInSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "La contraseña es obligatoria"),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const actualizarPerfilSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
});
export type ActualizarPerfilInput = z.infer<typeof actualizarPerfilSchema>;
