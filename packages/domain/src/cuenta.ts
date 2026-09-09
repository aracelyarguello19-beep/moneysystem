// [Source: architecture/data-models.md#Cuenta]
export interface Cuenta {
  id: string;
  email: string;
  nombre: string | null;
  avatarUrl: string | null;
  createdAt: Date;
}
